/**
 * 식단 복원 요청의 입구 게이트 — 본문(JSON 최대 75MB)을 **읽기 전에** 전역 자리를 잡는다(라우트 preParsing).
 *
 * 백업·복원 처리 게이트(MealDataService 의 archiveGate)는 핸들러 안이라, Fastify 가 본문을 이미 다 읽고 파싱한 뒤에
 * 걸린다. 그것만으로는 자리를 기다리는 요청마다 파싱된 본문이 메모리에 남았다(대기열 8건이면 본문 9개 — 수백 MB).
 * preParsing 은 인증·요청 한도(onRequest) 뒤, 본문을 읽기 전이다 — 여기서 기다리는 요청은 소켓 버퍼만 쥐므로 파싱된
 * 복원 본문은 프로세스에 한 건만 있다.
 *
 *   - 자리는 응답이 끝나거나(onResponse) 연결이 끊기면(close) 돌려준다. 기다리는 사이 끊긴 요청은 자리를 받자마자 돌려준다.
 *   - 대기열이 가득하거나 waitMs 안에 못 잡으면 busy() 에러(503)로 끝낸다 — 본문은 읽지 않고, 남은 업로드를 받지 않게
 *     연결을 닫는다.
 *   - 선언 크기(content-length)가 한도를 넘는 요청은 자리를 잡지 않는다 — 파서가 본문을 읽지 않고 413 을 낸다.
 *   - 자리를 잡고도 bodyDeadlineMs 안에 본문이 다 오지 않으면 연결을 끊는다(멈춘 업로드가 전역 자리를 계속 쥐지 못하게).
 *     운영은 nginx 가 본문을 모아 한 번에 넘기므로 닿지 않는 안전망이다.
 */
import type { IncomingMessage } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AsyncGate, GateBusyError } from '../../lib/async-gate.js';

const RESTORE_INTAKE_WAIT_MS = 60_000;
const RESTORE_BODY_DEADLINE_MS = 5 * 60_000;
// 프로세스 전역 — 복원 본문은 한 번에 한 건만 읽는다(테스트·진단이 active·queued 를 본다).
export const mealRestoreIntakeGate = new AsyncGate(1, { maxQueue: 8 });

export interface RestoreIntakeOptions {
  /** 이 크기를 넘는 선언 길이는 자리를 잡지 않는다(파서가 413 을 낸다). */
  maxBodyBytes: number;
  /** 자리를 못 잡았을 때 던질 에러(라우트가 503 으로 만든다). */
  busy: () => Error;
  gate?: AsyncGate;
  waitMs?: number;
  bodyDeadlineMs?: number;
}

export interface RestoreIntake {
  /** preParsing — 본문을 읽기 전에 자리를 잡는다. */
  hold: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** preValidation — 본문이 다 왔다(업로드 기한 해제). */
  bodyReceived: (req: FastifyRequest) => Promise<void>;
  /** onResponse — 자리를 돌려준다. */
  done: (req: FastifyRequest) => Promise<void>;
}

interface IntakeState {
  finish: () => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export const createRestoreIntake = (opts: RestoreIntakeOptions): RestoreIntake => {
  const gate = opts.gate ?? mealRestoreIntakeGate;
  const waitMs = opts.waitMs ?? RESTORE_INTAKE_WAIT_MS;
  const bodyDeadlineMs = opts.bodyDeadlineMs ?? RESTORE_BODY_DEADLINE_MS;
  const states = new WeakMap<IncomingMessage, IntakeState>();

  return {
    async hold(req, reply) {
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > opts.maxBodyBytes) return;

      let release: (() => void) | null = null;
      let closed = false;
      const state: IntakeState = {
        timer: null,
        finish: () => {
          closed = true;
          if (state.timer) clearTimeout(state.timer);
          state.timer = null;
          release?.();
          release = null;
        },
      };
      states.set(req.raw, state);
      // 응답이 끝나기 전에 연결이 끊겨도(업로드 중단·대기 중 이탈) 자리가 남지 않게 한다.
      reply.raw.once('close', state.finish);

      let acquired: () => void;
      try {
        acquired = await gate.acquire(waitMs);
      } catch (e) {
        if (!(e instanceof GateBusyError)) throw e;
        reply.header('connection', 'close');
        throw opts.busy();
      }
      if (closed) {
        // 기다리는 사이 연결이 끊겼다 — 받은 자리를 바로 돌려주고 여기서 멈춘다(끊긴 요청을 파싱 단계로 넘기지 않는다).
        acquired();
        reply.hijack();
        return;
      }
      release = acquired;
      state.timer = setTimeout(() => {
        req.raw.destroy(new Error('meal restore upload deadline exceeded'));
      }, bodyDeadlineMs);
      state.timer.unref?.();
    },
    async bodyReceived(req) {
      const state = states.get(req.raw);
      if (state?.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    },
    async done(req) {
      states.get(req.raw)?.finish();
    },
  };
};
