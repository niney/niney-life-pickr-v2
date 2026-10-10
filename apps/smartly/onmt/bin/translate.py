#!/usr/bin/env python
# -*- coding: utf-8 -*-
import warnings
warnings.filterwarnings('ignore')

from onmt.utils.logging import init_logger
from onmt.utils.misc import split_corpus
from onmt.translate.translator import build_translator
from onmt.utils.tokenizer import Tokenizer

import onmt.opts as opts
from onmt.utils.parse import ArgumentParser
from collections import defaultdict
import pandas as pd
from tqdm import tqdm
from datetime import datetime
import itertools
import os
from os.path import exists


def translate(opt, src_tokenizer):
    ArgumentParser.validate_translate_opts(opt)
    logger = init_logger(opt.log_file)

    tokenized_dir = f'data/data/tokenized'

    logger.info('Reading test set data....')

    df_src = pd.read_csv(f'{opt.src}', sep='\t')
    df_src[f'{opt.src_lang}'] = df_src[f'{opt.src_lang}'].replace(r' ', '')

    src_all = df_src[f'{opt.src_lang}'].to_numpy().tolist()
    src_all = [el.replace(' ', '') for el in src_all]

    logger.info(f'[{opt.src_lang}] test dataset size: {len(df_src)}')
    print()

    logger.info('Reading menu dictionary data....')
    df_menu = pd.read_pickle(f'data/data/2-084_menu_dictionary_v0129.pkl')
    df_menu['ko'] = df_menu['ko'].replace(' ', '')
    df_menu = df_menu[~df_menu['ko'].duplicated()]

    df_menu = df_menu[~df_menu[f'{opt.tgt_lang}'].isnull()]

    src_list = df_menu['ko'].to_numpy().tolist()
    tgt_list = df_menu[f'{opt.tgt_lang}'].to_numpy().tolist()

    tb_prediction = [''] * len(src_all)
    need_onmt_idx = []
    for i, word in tqdm(enumerate(src_all), desc='    Matching: ', total=len(src_all)):
        if word in src_list:
            idx = src_list.index(word)
            tb_prediction[i] = tgt_list[idx]
        else:
            need_onmt_idx.append(i)

    src = [el for el in src_all if el not in df_menu['ko'].to_numpy().tolist()]

    if len(need_onmt_idx) != len(src):
        logger.error('length is different... exit...')
        exit(0)

    opt.src = src

    print()
    logger.info('Tokenization started....')
    
    src_tokenized_path = f"{tokenized_dir}/2-084_onmt_ko_tokenized_{len(src)}.txt"
    file_exists = exists(src_tokenized_path)
    
    if not file_exists:
        src_tokenized = []
        for sentence in tqdm(src, desc="Tokenization: "):
            try:
                src_tokenized.append(' '.join(src_tokenizer.predict(sentence)))
            except:
                logger.exception('src_tokenized error! ', sentence)
                exit(0)

        # src_tokenized_path = f"{tokenized_dir}/{opt.src.split(os.sep)[-1].strip().replace(f'.{opt.input_type}', f'{opt.tgt_lang}_tokenized.txt')}"
        # src_tokenized_path = f'{tokenized_dir}/2-084_onmt_ko_tokenized_{len(src)}.txt'
        with open(src_tokenized_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(src_tokenized))
    
    opt.src = src_tokenized_path
  
    # print()
    # logger.info('Reading Tokenized file...')
    # opt.src = 'letr_kozh/data/tokenized/2-084_onmt_testset_zh_130405_tokenized.txt'

    print()
    logger.info('Prediction started....')
    translator = build_translator(opt, logger=logger, report_score=True)
    src_shards = split_corpus(opt.src, opt.shard_size)
    tgt_shards = split_corpus(opt.tgt, opt.shard_size)
    features_shards = []
    features_names = []
    for feat_name, feat_path in opt.src_feats.items():
        features_shards.append(split_corpus(feat_path, opt.shard_size))
        features_names.append(feat_name)
    shard_pairs = zip(src_shards, tgt_shards, *features_shards)

    translate_res = []
    for i, (src_shard, tgt_shard, *features_shard) in enumerate(shard_pairs):
        features_shard_ = defaultdict(list)
        for j, x in enumerate(features_shard):
            features_shard_[features_names[j]] = x
        print()
        logger.info("Translating shard %d." % i)
        _, pred = translator.translate(
            src=src_shard,
            src_feats=features_shard_,
            tgt=tgt_shard,
            batch_size=opt.batch_size,
            batch_type=opt.batch_type,
            attn_debug=opt.attn_debug,
            align_debug=opt.align_debug
            )

        translate_res.extend(pred)

    translate_res = list(itertools.chain(*translate_res))
    if len(need_onmt_idx) != len(translate_res):
        logger.error('length is different after translation... exit...')
        logger.error(f'{len(need_onmt_idx)}, {len(translate_res)}')
        exit(0)

    if opt.tgt_lang == 'en':
        max_char_length = 300
    elif opt.tgt_lang == 'ja':
        max_char_length = 50
    else:
        max_char_length = 30
    
    for j, prediction in zip(need_onmt_idx, translate_res):
        if len(prediction) > max_char_length:
            prediction = max(set(prediction.split()), key=prediction.split().count)
        tb_prediction[j] = prediction

    df_src['prediction'] = tb_prediction
    final_res_path = f'{opt.output}/2-084_onmt_ko{opt.tgt_lang}_result_{datetime.today().strftime("%m%d%H%M%S")}.xlsx'
    df_src.to_excel(f'{final_res_path}', index=False)
    print()
    logger.info(f'[{final_res_path}] is created!')


def _get_parser():
    parser = ArgumentParser(description='translate.py')
    opts.config_opts(parser)
    opts.translate_opts(parser)
    return parser


def main():
    parser = _get_parser()
    opt = parser.parse_args()

    # translate(opt)
    src_tokenizer = Tokenizer(opt.src_lang).load()
    translate(opt, src_tokenizer)


if __name__ == "__main__":
    main()
