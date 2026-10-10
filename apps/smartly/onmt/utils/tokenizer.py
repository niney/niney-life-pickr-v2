import os
from typing import List, Optional


class Tokenizer:
    """
    Use the dictionary you want to use to tokenize about the sentence.
    Args:
        sent: (str) sentence to be tokenized
    Returns:
        List[str]: tokenized token list
    Examples:
        >>> tk = Tokenizer(lang="ko")
        >>> tk("하늘을 나는 새를 보았다")
        ["_하늘", "을", "_나는", "_새", "를", "_보", "았다"]
        >>> tk = Pororo(task="tokenization", lang="en", model="roberta")
        >>> tk("I love you")
        ['I', 'Ġlove', 'Ġyou']
        >>> tk('''If the values aren’t unique, there is no unique inversion of the dictionary anyway or, with other words, inverting does not make sense.''')
        ['If', 'Ġthe', 'Ġvalues', 'Ġaren', 'âĢ', 'Ļ', 't', 'Ġunique', ',', 'Ġthere', 'Ġis', 'Ġno', 'Ġunique', 'Ġin', 'version', 'Ġof', 'Ġthe', 'Ġdictionary', 'Ġanyway', 'Ġor', ',', 'Ġwith', 'Ġother', 'Ġwords', ',', 'Ġinver', 'ting', 'Ġdoes', 'Ġnot', 'Ġmake', 'Ġsense', '.']
    """

    def __init__(self, lang: str):
        self.lang = lang

    @staticmethod
    def get_available_langs():
        return ["en", "ko", "ja", "zh"]

    def load(self):
        """
        Load user-selected task-specific model
        Args:
            device (str): device information
        Returns:
            object: User-selected task-specific model
        """

        if self.lang == "ko":
            try:
                import mecab
            except ModuleNotFoundError as error:
                raise error.__class__(
                    "Please install python-mecab-ko with: `pip install python-mecab-ko`"
                )
            model = mecab.MeCab()
            # model = mecab.MeCab('/usr/local/lib/mecab/dic/mecab-ko-dic_sys')
            return KoTokenizer(model)

        if self.lang == "en":
            try:
                from sacremoses import MosesDetokenizer, MosesTokenizer
            except ModuleNotFoundError as error:
                raise error.__class__(
                    "Please install sacremoses with: `pip install sacremoses`")
            model = MosesTokenizer(lang="en")
            detok = MosesDetokenizer(lang="en")
            return EnTokenizer(model, detok)

        if self.lang == "zh":
            try:
                import jieba
            except ModuleNotFoundError as error:
                raise error.__class__(
                    "Please install jieba with: `pip install jieba`")
            model = jieba.cut
            return ZhTokenizer(model)

        if self.lang == "ja":
            try:
                import fugashi
            except ModuleNotFoundError as error:
                raise error.__class__(
                    "Please install fugashi with: `pip install fugashi`")

            try:
                import ipadic
            except ModuleNotFoundError as error:
                raise error.__class__(
                    "Please install ipadic with: `pip install ipadic`")

            dic_dir = ipadic.DICDIR
            mecabrc = os.path.join(dic_dir, "mecabrc")
            mecab_option = "-d {} -r {} ".format(
                dic_dir,
                mecabrc,
            )
            model = fugashi.GenericTagger(mecab_option)
            return JaTokenizer(model)


class KoTokenizer:
    def __init__(self, model):
        self._model = model

    def detokenize(self, tokens: List[str]):
        text = "".join(tokens).replace("▃", " ").strip()
        return text

    def predict(
            self,
            text: str,
            **kwargs,
    ) -> List[str]:
        preserve_whitespace = kwargs.get("preserve_whitespace", False)

        text = text.strip()
        text_ptr = 0
        results = list()

        for unit in self._model.parse(text):
            token = unit[1]
            if preserve_whitespace:
                if text[text_ptr] == " ":
                    # Move text pointer to whitespace token to reserve whitespace
                    # cf. to prevent double white-space, we move pointer to next eojeol
                    while text[text_ptr] == " ":
                        text_ptr += 1
                    results.append(" ")

            results.append(token)
            text_ptr += len(token)

        return results


class EnTokenizer:

    def __init__(self, model, detok):
        self._model = model
        self._detok = detok

    def detokenize(self, tokens: List[str]):
        return self._detok.detokenize(tokens)

    def predict(self, text: str, **kwargs) -> List[str]:
        return self._model.tokenize(text)


class JaTokenizer:

    def __init__(self, model):
        self._model = model

    def detokenize(self, tokens: List[str]):
        return "".join(tokens)

    def predict(self, text: str, **kwargs) -> List[str]:
        parsed = self._model.parse(text)

        res = []
        for line in parsed.split("\n"):
            if line == "EOS":
                break
            toks = line.split("\t")
            res.append(toks[0])
        return res


class ZhTokenizer:

    def __init__(self, model):
        self._model = model

    def detokenize(self, tokens: List[str]):
        return "".join(tokens)

    def predict(self, text: str, **kwargs) -> List[str]:
        return list(self._model(text))


def tokenize(text, language_code):
    tokenizer = Tokenizer(language_code).load()
    return tokenizer.predict(text)


def detokenize(text, language_code):
    tokenizer = Tokenizer(language_code).load()
    return tokenizer.detokenize(text)