"""基于 JD 的 AI 模拟面试模块（竞赛赛题 A11）。

分层与仓库其余业务模块一致：api -> service -> dao -> models；模型调用单独放在
llm.py，复用 settings 模块的用户级模型配置与 jd/parser.py 的同步调用范式。
"""
