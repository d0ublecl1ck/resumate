"""判断用户配置的模型是否支持图像输入。

背景：`settings/data/model_catalog.json` 的投影只有 id / label / 上下文与成本，
**没有 capabilities / modalities 字段**（models.dev 快照被 refresh 脚本投影时未保留），
所以无法从目录里读取「能不能看图」。这里改为按模型族显式判定：

- 只对已知的视觉模型族返回 True（OpenAI gpt-4o/4.1/4-turbo/5/6 与 o 系列、
  Anthropic claude、智谱 glm-*-v、通用名含 vision/vl/omni/multimodal 等）；
- 未知模型一律返回 False（保守），让用户显式换成视觉模型，而不是把图片发出去
  再吃一个上游 4xx。

这不是能力元数据，只是可复核的模型名白名单；模型目录补上 modalities 后应改为
读取目录字段，本模块是临时且明确的替代。
"""

from __future__ import annotations

import re

# provider id（小写）-> 该 provider 下的视觉模型名匹配。
_PROVIDER_PATTERNS: dict[str, tuple[str, ...]] = {
    "openai": (
        r"gpt-4o",
        r"gpt-4\.1",
        r"gpt-4-turbo",
        r"gpt-5",
        r"gpt-6",
        r"(^|[-_])o[134]($|[-_])",
        r"chatgpt-4o",
    ),
    "anthropic": (r"claude-",),
    "zhipuai": (r"glm-.*v",),
    "deepseek": (r"vision", r"-vl($|[-_])"),
}

# 与 provider 无关的通用视觉命名。
_GENERIC_PATTERNS: tuple[str, ...] = (
    r"vision",
    r"multimodal",
    r"omni",
    r"-vl($|[-_])",
    r"llava",
    r"pixtral",
    r"internvl",
    r"minicpm-v",
    r"qwen.*vl",
)


def model_supports_vision(*, provider: str | None, model: str) -> bool:
    """模型名命中已知视觉模型族才返回 True；未知模型保守返回 False。"""
    name = (model or "").strip().lower()
    if not name:
        return False
    provider_id = (provider or "").strip().lower()
    patterns = _PROVIDER_PATTERNS.get(provider_id, ()) + _GENERIC_PATTERNS
    return any(re.search(pattern, name) for pattern in patterns)
