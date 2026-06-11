# Free AI Voice TTS Research — Chinese Real Estate Video Content

> **Date:** 2026-06-11
> **Context:** Finding a free (or very low-cost) Chinese TTS solution for producing Australian real estate video voiceovers in Mandarin/Cantonese. Voices should sound natural/professional for property descriptions, not robotic.

---

## Quick Comparison Table

| Tool | Free? | Chinese Quality (1-5) | Difficulty | Offline? | Recommend? |
|------|-------|----------------------|------------|----------|-----------|
| **CapCut AI Voice** | ✅ Freemium | ⭐⭐⭐⭐ 4/5 | Easy | ❌ | ✅ **Best for quick video** |
| **Edge-TTS** | ✅ Free | ⭐⭐⭐⭐ 4/5 | Easy | ❌ | ✅ **Best cost/quality** |
| **Kokoro TTS** | ✅ Free (open) | ⭐⭐⭐ 3/5 | Medium-Hard | ✅ Yes | ⚠️ Good, needs setup |
| **CosyVoice 3** | ✅ Free (open) | ⭐⭐⭐⭐⭐ 5/5 | Hard | ✅ Yes | 🏆 **Best quality open-source** |
| **Fish Speech S2** | ⚠️ Research license | ⭐⭐⭐⭐⭐ 5/5 | Hard | ✅ Yes | 🏆 State-of-art, license caveat |
| **gTTS** | ✅ Free | ⭐⭐ 2/5 | Easy | ❌ | ❌ Too robotic |
| **Bark (Suno)** | ✅ Free (open) | ⭐⭐ 2/5 | Hard | ✅ Yes | ❌ Heavy, Chinese is experimental |

---

## 1️⃣ CapCut AI Voice

**Status:** Freemium — free tier available, Pro required for some features

### What's available
- 600+ AI voices across many languages (via CapCut TTS page)
- Chinese voices included: several male and female options
- Works inside CapCut video editor (desktop, web, mobile)
- Can also use via capcut.com/tools/text-to-speech (web TTS tool)
- Voice cloning available: record a few sentences → AI replicates your voice

### Chinese Voice Quality: ⭐⭐⭐⭐ (4/5)
- Generally good for short-to-medium content
- Sounds natural enough for social media video
- Cantonese support is limited compared to Mandarin

### Limitations
- **Free tier limits:** watermarks on exports, limited daily usage, some voices are Pro-only
- **Pro pricing:** approx. A$10-15/month for full access
- **Requires internet** — no offline mode
- **Export quality:** free tier may cap audio quality
- **Not scriptable:** must use CapCut UI; no API/batch mode for free users

### Setup Time: 5 minutes (install app, pick voice, generate)
### Difficulty: Easy ✅

### Verdict for our use case
**Good for quick one-off videos**, especially if you're editing in CapCut anyway. But the free tier's daily limits and lack of API/automation make it impractical for batch or programmatic use.

---

## 2️⃣ Kokoro TTS

**Repository:** https://huggingface.co/hexgrad/Kokoro-82M
**License:** Apache 2.0 ✅

### Overview
- 82M parameter model — extremely compact and fast
- Apache 2.0 license — free for commercial use
- #1 TTS model on TTS-Arena rankings for much of 2025
- Supports English, French, Korean, Japanese, Mandarin Chinese
- Can run on CPU (slow) or GPU (fast)

### Chinese Voice Quality: ⭐⭐⭐ (3/5)
- Supports Mandarin Chinese via specific voice profiles (e.g. `zf_xiaoyi`, `zf_xiaobei`)
- Quality is decent but noticeably behind dedicated Chinese-native models
- Some reports of the Chinese phonemizer failing when used through third-party wrappers (e.g. Nexa CLI) — outputs "Chinese letter" instead of real speech
- English voices (esp. `af_bella`, `am_adam`) are excellent; Chinese is secondary quality
- Less prosody control and natural rhythm compared to CosyVoice/Fish Speech for Chinese

### Setup
```bash
pip install kokoro
# Or use the GitHub repo for more control
git clone https://github.com/hexgrad/kokoro.git
cd kokoro
pip install -r requirements.txt
```

### Offline: ✅ Yes — fully local after model download (~160MB)
### Setup Time: 30-60 minutes
### Difficulty: Medium (Python, pip, model download)

### Verdict for our use case
A solid **budget secondary option**. Perfect if you want fully offline, lightweight TTS. Chinese quality is acceptable but not amazing. Best used via the official Kokoro package, not third-party wrappers.

---

## 3️⃣ Edge-TTS

**Repository:** https://github.com/rany2/edge-tts
**License:** MIT (reverse-engineered Microsoft API, use at own risk)

### Overview
- Wraps Microsoft Edge's online TTS service (Azure Cognitive Services backend)
- **No API key needed** — uses Edge's free internal endpoint
- Rich voice selection: 400+ voices across 100+ languages

### Chinese Voices Available

| Voice Name | Gender | Language | Notes |
|-----------|--------|----------|-------|
| **zh-CN-XiaoxiaoNeural** | Female | Mandarin (CN) | ✅ Excellent, most natural |
| **zh-CN-YunxiNeural** | Male | Mandarin (CN) | ✅ Good, professional tone |
| **zh-CN-YunyangNeural** | Male | Mandarin (CN) | ✅ Deep, news-anchor style |
| **zh-CN-XiaochenNeural** | Female | Mandarin (CN) | ✅ Warm, friendly |
| **zh-CN-XiaohanNeural** | Female | Mandarin (CN) | ✅ Lively, energetic |
| **zh-CN-XiaomengNeural** | Female | Mandarin (CN) | ✅ Novel reading style |
| **zh-CN-XiaomoNeural** | Female | Mandarin (CN) | ✅ Affectionate |
| **zh-CN-XiaoqiuNeural** | Female | Mandarin (CN) | ✅ Gentle, narrative |
| **zh-CN-XiaoruiNeural** | Female | Mandarin (CN) | ✅ Senior/wise |
| **zh-CN-XiaoshuangNeural** | Female | Mandarin (CN) | ✅ Youthful, cute |
| **zh-HK-HiuGaaiNeural** | Female | Cantonese (HK) | ✅ Good for Cantonese |
| **zh-HK-HiuMaanNeural** | Female | Cantonese (HK) | ✅ |
| **zh-HK-WanLungNeural** | Male | Cantonese (HK) | ✅ |
| **zh-TW-HsiaoChenNeural** | Female | Taiwanese Mandarin | ✅ |
| **zh-TW-HsiaoYuNeural** | Female | Taiwanese Mandarin | ✅ |
| **zh-TW-YunJheNeural** | Male | Taiwanese Mandarin | ✅ |

### Chinese Voice Quality: ⭐⭐⭐⭐ (4/5)
- **Xiaoxiao** is excellent — natural, clear, professional
- Comparable to paid services for Mandarin
- Supports rate, volume, and pitch adjustment
- Subtitles (SRT) generation built-in

### Setup
```bash
pip install edge-tts

# List voices
edge-tts --list-voices | grep zh

# Generate speech
edge-tts --voice zh-CN-XiaoxiaoNeural \
  --text "欢迎来到这套位于墨尔本的豪华公寓" \
  --write-media output.mp3 \
  --write-subtitles output.srt
```

### Python usage
```python
import edge_tts
import asyncio

async def generate():
    tts = edge_tts.Communicate(
        "欢迎来到这套位于墨尔本的豪华公寓",
        voice="zh-CN-XiaoxiaoNeural",
        rate="-10%",
        volume="+0%"
    )
    await tts.save("output.mp3")

asyncio.run(generate())
```

### Offline: ❌ No — requires internet for every request
### Setup Time: 2 minutes (one pip install)
### Difficulty: Easy ✅

### Critical Limitations
- **Uses reverse-engineered API** — Microsoft could block it at any time
- Some historical blocks took weeks to work around
- **Not for commercial products** (TOS violation — don't resell as a service)
- Requires internet for every generation
- Rate limiting may apply at high volumes

### Verdict for our use case
**Best "set up in 2 minutes" option** with excellent Chinese Xiaoxiao voice. Ideal for prototyping and low-volume internal use. The risk of Microsoft blocking the API makes it unsuitable as a long-term production dependency, but for generating video voiceovers in batches, it's hard to beat for zero cost and easy setup.

---

## 4️⃣ Fish Speech / Fish Audio S2

**Repository:** https://github.com/fishaudio/fish-speech
**License:** Research license (not Apache/MIT — must check commercial terms)
**Website:** https://speech.fish.audio

### Overview
- S2 is the latest model: trained on 10M+ hours across 50 languages
- **#1 on TTS-Arena** among open-source models (2025)
- State-of-the-art benchmarks:
  - Seed-TTS Eval — Chinese WER: **0.54%** (best overall, beating closed-source)
  - Audio Turing Test: **0.515** (beats Seed-TTS, MiniMax-Speech)
  - EmergentTTS-Eval win rate: **81.88%**
- Dual-Autoregressive architecture
- Fine-grained emotion/prosody control via natural language tags (`[laugh]`, `[whisper]`, etc.)

### Chinese Voice Quality: ⭐⭐⭐⭐⭐ (5/5)
- Native Chinese model — trained on massive Chinese audio data
- Best-in-class WER for Chinese on Seed-TTS Eval
- Natural, emotional, human-like
- Supports voice cloning

### Models

| Model | Size | Notes |
|-------|------|-------|
| S2-Pro | 4B params | Flagship, best quality, needs GPU |
| S1 | 1.5B | Previous generation, still excellent |

### Setup
```bash
# Docker (recommended)
docker pull fishaudio/fish-speech

# Or local install
git clone https://github.com/fishaudio/fish-speech.git
cd fish-speech
pip install -e .

# WebUI
python -m fish_speech.webui
```

### Offline: ✅ Yes — fully local after model download
### Setup Time: 1-2 hours (GPU + model download ~8GB)
### Difficulty: Hard (requires GPU, model management)

### Critical Limitations
- **Research license** — not Apache/MIT. Must check if commercial video production is allowed
- S2-Pro requires **significant GPU** (8GB+ VRAM minimum, 16GB+ recommended)
- 4B parameters = heavy inference
- Setup is non-trivial; Docker helps but not turnkey

### Verdict for our use case
**Best quality option** if you can stomach the license and GPU requirements. The Chinese quality is genuinely best-in-class. If your Mac has Apple Silicon with enough RAM, it may run acceptably. Not the first choice for simplicity, but the gold standard for quality.

---

## 5️⃣ CosyVoice (Alibaba / FunAudioLLM)

**Repository:** https://github.com/FunAudioLLM/CosyVoice
**License:** Apache 2.0 (v1/v2) — check v3 for updated terms
**Stars:** 21.4k ⭐

### Overview
- LLM-based TTS system by Alibaba's FunAudioLLM team
- **Best open-source option for Chinese** — natively built for Chinese
- Current version: **Fun-CosyVoice 3.0** (0.5B params)
- Also supports English, Japanese, Korean, German, Spanish, French, Italian, Russian
- **18+ Chinese dialects/accents** (Cantonese, Minnan, Sichuan, Dongbei, Shanghai, Tianjin, Shandong, etc.)
- Zero-shot voice cloning
- Streaming inference: 150ms latency
- Supports pronunciation inpainting (pinyin/phonemes)

### Chinese Voice Quality: ⭐⭐⭐⭐⭐ (5/5)
- Chinese benchmark: 0.81% CER (Character Error Rate) on test-zh — near-human
- Speaker similarity (SS): 78.0% — best among open-source
- Native Chinese architecture — designed for Chinese prosody and tones
- Supports emotions, speed, volume control via text instructions
- Can handle mixed Chinese-English text naturally

### Setup
```bash
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice

# Conda env
conda create -n cosyvoice -y python=3.10
conda activate cosyvoice
pip install -r requirements.txt

# Download models
# Uses ModelScope (Chinese-friendly download)
from modelscope import snapshot_download
snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512')
```

### Offline: ✅ Yes — fully local after model download (~2GB for 0.5B model)
### Setup Time: 1-2 hours
### Difficulty: Hard (Conda, dependencies, model download requires care)

### Requirements
- **Minimal:** 0.5B model runs on CPU (slow but works) or GPU (fast)
- Recommended: 8GB+ RAM, ideally NVIDIA GPU with 4GB+ VRAM
- Apple Silicon works with MPS backend

### Verdict for our use case
**🏆 Best overall recommendation for our use case.** Apache 2.0 licensed, Chinese-native, excellent quality, offline-capable, and the 0.5B model can run on modest hardware. If you can spare 1-2 hours for setup, this is the most future-proof free option with the best Chinese quality-to-effort ratio. The dialect support (Cantonese, Sichuan, Shanghai etc.) is a huge bonus for real estate content targeting specific communities.

---

## 6️⃣ gTTS (Google Text-to-Speech)

**Repository:** https://github.com/pndurette/gTTS
**License:** MIT

### Overview
- Python wrapper around Google Translate's TTS API
- Minimal, no-frills TTS
- Supports many languages including Chinese (`zh-CN`, `zh-TW`, `zh-HK`, `yue`)

### Chinese Voice Quality: ⭐⭐ (2/5)
- **Noticeably robotic** compared to other options
- Single voice per language (no choice of male/female or style)
- No prosody control, no emotion
- Sounds like old-school GPS navigation voice
- Acceptable for understanding, poor for professional video

### Setup
```bash
pip install gTTS

# CLI
gtts-cli "欢迎" --lang zh-CN --output hello.mp3

# Python
from gtts import gTTS
tts = gTTS("欢迎来到墨尔本", lang="zh-CN")
tts.save("output.mp3")
```

### Offline: ❌ No — requires internet (Google Translate API)
### Setup Time: 1 minute
### Difficulty: Easy ✅

### Verdict for our use case
**❌ Not recommended.** Too robotic for professional real estate video content. Use only as a quick fallback for testing/development.

---

## 7️⃣ Bark (Suno)

**Repository:** https://github.com/suno-ai/bark
**License:** MIT
**Status:** Largely superseded by newer models (no active development since 2023)

### Overview
- Transformer-based text-to-speech by Suno (the music AI company)
- Generates speech + non-speech sounds (laughing, sighing)
- Multilingual: English, Chinese, French, Spanish, German, Japanese, Korean
- **No longer actively maintained** — community forks exist

### Chinese Voice Quality: ⭐⭐ (2/5)
- Chinese support is **experimental** — trained on limited Chinese data
- Often produces garbled or accented Chinese
- Requires voice presets (speaker prompts) to stabilize quality
- Heavy model (~12GB download)

### Setup
```bash
pip install git+https://github.com/suno-ai/bark.git
# Or use suno-bark on pip
pip install suno-bark
```

### Offline: ✅ Yes — fully local
### Setup Time: 1 hour (large model download)
### Difficulty: Medium-Hard (GPU recommended, large model)

### Requirements
- GPU strongly recommended (12GB+ VRAM)
- CPU inference is very slow (~30-60x real-time)
- ~12GB disk space for model

### Verdict for our use case
**❌ Not recommended.** Outdated, unmaintained, Chinese support is experimental, and the model is huge. Stick with CosyVoice or Fish Speech for Chinese.

---

## 🏆 Final Recommendations

### For quick setup (5 min)
```
1st:  Edge-TTS  → pip install edge-tts, use Xiaoxiao voice
2nd:  CapCut     → If already using CapCut for video editing
```

### For best quality + free + offline
```
1st:  CosyVoice 3  → Apache 2.0, Chinese-native, best quality-to-effort
2nd:  Fish S2      → Slightly better quality, but research license
3rd:  Kokoro       → Lightest (82M params), good-enough Chinese
```

### For batch/programmatic production
```
Edge-TTS (prototype) → CosyVoice (production)
Use Edge-TTS to iterate on scripts quickly, then switch to CosyVoice for final renders.
```

### Recommended architecture
```
Script → [Edge-TTS for preview] → [CosyVoice 3 for final]
         ↓
    mp3 output
         ↓
    overlay on real estate video
```

---

## Quick Start — Edge-TTS (our fastest path)

```bash
# 1. Install
pip install edge-tts

# 2. Test with Chinese
edge-tts --voice zh-CN-XiaoxiaoNeural \
  --text "欢迎来到位于墨尔本市中心的两房两卫豪华公寓" \
  --write-media sample.mp3

# 3. List all Chinese voices
edge-tts --list-voices | grep zh
```

## Quick Start — CosyVoice 3 (our quality path)

```bash
# 1. Clone + install
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
conda create -n cosyvoice -y python=3.10
conda activate cosyvoice
pip install -r requirements.txt

# 2. Download model (from Python)
from modelscope import snapshot_download
snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512')

# 3. Inference
from cosyvoice.cli.cosyvoice import CosyVoice
cosyvoice = CosyVoice('pretrained_models/Fun-CosyVoice3-0.5B-2512')
audio = cosyvoice.inference_zero_shot('欢迎参观这套墨尔本别墅', 'default_voice')
```

---

## Appendix: Voice Selection Guidance for Real Estate

| Content Type | Recommended Voice | Tool |
|-------------|-------------------|------|
| Mandarin — Professional property tour | zh-CN-XiaoxiaoNeural (female) | Edge-TTS |
| Mandarin — Luxury/prestige listing | zh-CN-YunxiNeural (male) | Edge-TTS |
| Mandarin — Warm/friendly | CosyVoice 3 default female | CosyVoice 3 |
| Mandarin — Fast walkthrough/IG-style | CapCut "活泼" voice | CapCut |
| Cantonese — General | zh-HK-HiuGaaiNeural (female) | Edge-TTS |
| Cantonese — Professional | zh-HK-WanLungNeural (male) | Edge-TTS |

---

*Research compiled from official documentation, GitHub repos, PyPI, HuggingFace model pages, community reviews (Reddit, Medium), and direct tool testing.*
