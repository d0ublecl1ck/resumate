"""岗位题库模块（竞赛赛题 A11）。

分层照抄仓库既有业务模块：api -> service -> dao -> models；题干去重靠
(role, prompt_hash) 唯一约束，真实数据由 scripts/generate_bank.py 调用已配置的
模型生成，或由 POST /bank/import 批量导入。
"""
