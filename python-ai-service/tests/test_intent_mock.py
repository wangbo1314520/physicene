"""意图分类关键词规则单测（mock 通道，离线）。"""
from physicene_ai.core.intent_classifier import _keyword_classify


def test_load_template():
    r = _keyword_classify("做个小车碰撞实验")
    assert r.intent == "load_template" and r.entities["template"] == "collision"


def test_free_build_add():
    r = _keyword_classify("加一个小球")
    assert r.intent == "free_build"
    assert r.entities["action"] == "add" and r.entities["elementType"] == "sphere"


def test_free_build_clear():
    assert _keyword_classify("清空场景").entities["action"] == "clear"


def test_modify():
    r = _keyword_classify("把质量改成3")
    assert r.intent == "modify" and r.entities["property"] == "mass"


def test_question():
    assert _keyword_classify("什么是动量守恒").intent == "question"
    assert _keyword_classify("为什么会损失能量").intent == "question"


def test_history():
    assert _keyword_classify("看看我的实验记录").intent == "history"


def test_ambiguous_clarifies():
    assert _keyword_classify("嗯").need_clarify is True
