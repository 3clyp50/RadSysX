# RadSysX GPU Evaluation Log

Last updated: 2026-06-13
Status: first GPU bring-up plus first gated-model smokes complete; model integration not implemented.
Machine: remote Ubuntu 24.04 GPU VM accessed with `ssh eclypso@89.169.110.187`.

## Purpose

This log records the first real GPU experiment for the future RadSysX AI sidebar backend. It is a dated evidence trail, not a production runbook yet.

The immediate goal was to prove that a fresh Ubuntu 24.04 NVIDIA host can:

- Bootstrap the current RadSysX desktop fast path from the repo.
- Build the frontend and OHIF viewer assets needed by the Electron path.
- Create an isolated AI Python environment without polluting the clinical `.venv`.
- Install CUDA-enabled PyTorch.
- Pull and run a candidate local realtime ASR model, starting with NVIDIA Nemotron 3.5 ASR Streaming 0.6B.
- Identify gated model access blockers before spending time on MedGemma, Pillar-0/Sybil, or BiomedParse downloads.

## VM Snapshot

Observed on 2026-06-12:

| Item | Value |
| --- | --- |
| OS | Ubuntu 24.04.4 LTS |
| Kernel | `6.11.0-1016-nvidia` |
| Virtualization | KVM |
| CPU platform | AMD host CPU |
| GPU | NVIDIA L40S |
| Driver | `580.159.04` |
| CUDA reported by `nvidia-smi` | `13.0` |
| GPU VRAM | `46068 MiB` reported by `nvidia-smi` |
| RAM | `94 GiB` total, `92 GiB` available after setup check |
| Disk | `/dev/vda1`, `1.3T` total, `1.2T` available after setup check |
| Node.js | `v22.22.3` |
| npm | `10.9.8` |
| Repo commit on VM | `e57e5ef Ignore AI experiment venv` |

After the Nemotron process exited, `nvidia-smi` reported no running GPU processes and `0 MiB` used.

## Repo And Desktop Bring-Up

The VM was synced to the local repo state with the latest roadmap commits. The remote working tree was clean before AI experiments except for ignored runtime artifacts.

RadSysX bootstrap and validation performed on the VM:

```bash
sudo apt-get update
sudo apt-get install -y \
  python3-pip python3-dev build-essential pkg-config cmake curl jq \
  nodejs npm ffmpeg libsndfile1 git-lfs espeak-ng

sudo npm install -g n
sudo n 22

npm install --legacy-peer-deps
npm run desktop:bootstrap
npm run desktop -- --check-only
npm run desktop:doctor
npm run type-check --workspace viewer
npm run build --workspace viewer
npm run type-check --workspace frontend
npm run build --workspace frontend
. .venv/bin/activate && python3 -m pytest backend/tests/test_clinical_platform.py
```

Observed RadSysX results:

- `npm run desktop -- --check-only` passed.
- `npm run desktop:doctor` passed and reported Node.js, npm, desktop runtime files, clinical Python dependencies, workspace Node dependencies, OHIF dist, and Next.js production shell all ready.
- `npm run type-check --workspace viewer` passed.
- `npm run build --workspace viewer` passed.
- `npm run type-check --workspace frontend` passed.
- `npm run build --workspace frontend` passed.
- `python3 -m pytest backend/tests/test_clinical_platform.py` passed: `29 passed, 132 warnings`.
- Full interactive Electron/OHIF visual smoke was not run because the VM is headless and has no GUI by default.

Notes:

- `npm install --legacy-peer-deps` reported existing audit issues: `36 vulnerabilities` total, split as `5 low`, `17 moderate`, `11 high`, and `3 critical`. No `npm audit fix` was run because that would be unrelated dependency churn.
- The clinical `.venv` remains separate from the AI `.venv-ai`.

## AI Environment

Created an isolated AI environment:

```bash
python3 -m venv .venv-ai
. .venv-ai/bin/activate
python -m pip install --upgrade pip setuptools wheel
```

The AI environment and remote env file are not committed:

- `.venv-ai/`
- `.env.ai`

The remote `.env.ai` used:

```bash
RADSYSX_MODEL_CACHE=$HOME/.cache/radsysx/models
HF_HOME=$HOME/.cache/radsysx/models/huggingface
TRANSFORMERS_CACHE=$HOME/.cache/radsysx/models/huggingface/transformers
HF_HUB_ENABLE_HF_TRANSFER=1
```

Update before the next pass:

- Hugging Face now warns that `HF_HUB_ENABLE_HF_TRANSFER` is deprecated. Prefer testing `HF_XET_HIGH_PERFORMANCE=1` for future large downloads.

Installed CUDA PyTorch:

```bash
python -m pip install --extra-index-url https://download.pytorch.org/whl/cu130 \
  torch torchvision torchaudio
```

Observed key AI package versions after the NeMo install:

| Package | Version |
| --- | --- |
| `torch` | `2.12.0+cu130` |
| `torchvision` | `0.27.0+cu130` |
| `torchaudio` | `2.11.0+cu130` |
| `nemo_toolkit` | `3.1.0+95f92737c` |
| `transformers` | `5.12.0` |
| `accelerate` | `1.14.0` |
| `huggingface_hub` | `1.19.0` |
| `hf_transfer` | `0.1.9` |
| `safetensors` | `0.8.0` |
| `sentencepiece` | `0.2.1` |
| `librosa` | `0.11.0` |
| `soundfile` | `0.14.0` |
| `lightning` | `2.4.0` |
| `pytorch-lightning` | `2.6.5` |

## CUDA Smoke

PyTorch CUDA smoke passed:

```text
torch 2.12.0+cu130
cuda_available True
torch_cuda 13.0
device_count 1
device_name NVIDIA L40S
capability (8, 9)
matmul_seconds 0.1246
peak_vram_gib 0.164
```

Public Hugging Face tiny model smoke passed on CUDA:

```text
model sshleifer/tiny-gpt2
load_seconds 4.288
generate_seconds 0.319
peak_vram_gib 0.0089
output RadSysX GPU smoke test: factors factors factors...
```

This proves the VM can download public models, load Transformers models, and execute GPU inference.

`bitsandbytes==0.49.2` was later installed into `.venv-ai` for a MedGemma 27B quantized smoke. It is not needed for the preferred MedGemma 1.5 4B BF16 path.

## Hugging Face Access Probe

No Hugging Face token was configured on the VM during the first pass:

```text
token_present False
LocalTokenNotFoundError
```

Model info probe without a token:

| Model | Result |
| --- | --- |
| `nvidia/nemotron-3.5-asr-streaming-0.6b` | public, not gated |
| `google/medgemma-1.5-4b-it` | public metadata, gated/auto access |
| `YalaLab/Pillar0-Sybil-1.5` | public metadata, gated/auto access |
| `microsoft/BiomedParse` | public metadata, gated/auto access |

Implication:

- Nemotron can be tested immediately.
- MedGemma, Pillar0-Sybil-1.5, and BiomedParse require Hugging Face authentication and likely terms acceptance before weight download.
- Before any packaging or clinical plan, license and usage terms must be checked artifact by artifact.

### Authenticated Follow-Up

On 2026-06-13, the user provided a temporary Hugging Face token and confirmed terms had been accepted on the Hugging Face website. The token was installed only into the VM user's Hugging Face cache with git credential storage disabled. Do not commit or log the token.

After the gated-model tests, the cached token was removed from the VM Hugging Face cache and `huggingface_hub.get_token()` returned `False`. The user still planned to rotate the token externally.

Authenticated access results:

| Model | Access result | Notes |
| --- | --- | --- |
| `google/medgemma-1.5-4b-it` | Success | gated/auto; small files and both safetensor shards accessible |
| `google/medgemma-27b-it` | Success | gated/auto; small files accessible; full repo about 54.9 GB, superseded as default by the 1.5 4B model |
| `YalaLab/Pillar0-Sybil-1.5` | Success | gated/auto; `license:ecl-2.0`; checkpoints accessible |
| `YalaLab/Pillar0-ChestCT` | Success | gated/auto; `license:ecl-2.0`; config and weights accessible |
| `YalaLab/Pillar0-HeadCT` | Success | gated/auto; config accessible |
| `YalaLab/Pillar0-AbdomenCT` | Success | gated/auto; config accessible |
| `YalaLab/Pillar0-BreastMRI` | Success | gated/auto; config accessible |
| `microsoft/BiomedParse` | Success | gated/auto; `license:cc-by-nc-sa-4.0`; README/config files accessible, inference not yet attempted |

## Nemotron 3.5 ASR Streaming 0.6B

Source snapshot checked 2026-06-12: [NVIDIA Nemotron 3.5 ASR Streaming 0.6B](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b).

Relevant model-card facts:

- License: `openmdw-1.1`.
- Runtime: NVIDIA NeMo.
- Architecture: 600M parameter cache-aware FastConformer-RNNT with language-ID prompt conditioning.
- Use case: multilingual transcription.
- Language prompt is required through `target_lang`, for example `en-US`, or `auto`.
- Streaming chunk sizes are configurable from 80 ms to 1120 ms through attention context.
- Model card reports Linux as the supported OS for this NeMo integration, but RadSysX remains an Electron cross-platform product. Treat this as the first NVIDIA/Linux worker lane, not as a product boundary.

### NeMo Install

The model card's older install form failed under pip 26:

```bash
pip install git+https://github.com/NVIDIA/NeMo.git@main#egg=nemo_toolkit[asr]
```

Failure shape:

```text
invalid-egg-fragment
```

The modern PEP 508 form worked:

```bash
python -m pip install "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git@main"
```

Observed install result:

- NeMo repo commit: `95f92737cfb8ee0123bb328b07a2d24c6d859aff`
- Installed package: `nemo_toolkit-3.1.0+95f92737c`
- Import passed: `import nemo.collections.asr as nemo_asr`

Because this lives in `.venv-ai`, NeMo's dependency changes do not affect the clinical runtime `.venv`.

### Load Test

Model load command:

```python
import time
import torch
import nemo.collections.asr as nemo_asr

model_name = "nvidia/nemotron-3.5-asr-streaming-0.6b"
torch.cuda.empty_cache()
torch.cuda.reset_peak_memory_stats()
load0 = time.perf_counter()
model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name).to("cuda")
model.eval()
torch.cuda.synchronize()
print("load_seconds", round(time.perf_counter() - load0, 3))
print("device", next(model.parameters()).device)
print("peak_vram_gib", round(torch.cuda.max_memory_allocated() / 1024**3, 3))
```

First successful load:

```text
load_seconds 49.702
device cuda:0
peak_vram_gib 4.822
current_vram_gib 4.797
```

Model restored from the Hugging Face cache:

```text
/home/eclypso/.cache/radsysx/models/huggingface/hub/models--nvidia--nemotron-3.5-asr-streaming-0.6b/snapshots/24b151a851dd15909e1fc611b11bb2da52b9fc81/nemotron-3.5-asr-streaming-0.6b.nemo
```

### Synthetic Voice Test

Created a synthetic test utterance with `espeak-ng`, then resampled to 16 kHz mono:

```bash
mkdir -p tmp/ai-audio
espeak-ng -v en-us -s 145 \
  "This is a RadSysX radiology voice test. Please switch to lung window." \
  -w tmp/ai-audio/radsysx_voice_test.wav

ffmpeg -y -i tmp/ai-audio/radsysx_voice_test.wav \
  -ac 1 -ar 16000 tmp/ai-audio/radsysx_voice_test_16k.wav
```

Observed input:

```text
codec pcm_s16le
sample_rate 16000 after resample
channels mono
duration about 4.35 seconds
```

### Transcription API Findings

Naive convenience call failed:

```python
model.transcribe([wav], batch_size=1)
```

Failure:

```text
ValueError: Unknown prompt key: 'None'. Available: ['en-US', 'en', 'en-GB', 'enGB', 'es-ES', 'esES', 'es-US', 'es', 'zh-CN', 'zh-ZH']...
```

Adding `target_lang="en-US"` directly still failed in the current NeMo/Lhotse path:

```python
model.transcribe([wav], batch_size=1, target_lang="en-US")
```

Reason observed from local package inspection:

- `RNNTPromptTranscribeConfig` has `target_lang`.
- The prompt-aware wrapper accepts `target_lang`.
- The default Lhotse dataloader still looks for language metadata on generated supervision records and finds `None`.

Working path:

```python
import time
import torch
import nemo.collections.asr as nemo_asr
from nemo.collections.asr.models.rnnt_bpe_models_prompt import RNNTPromptTranscribeConfig

wav = "tmp/ai-audio/radsysx_voice_test_16k.wav"
model_name = "nvidia/nemotron-3.5-asr-streaming-0.6b"

torch.cuda.empty_cache()
torch.cuda.reset_peak_memory_stats()
model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name).to("cuda")
model.eval()

trcfg = RNNTPromptTranscribeConfig(
    use_lhotse=False,
    batch_size=1,
    num_workers=0,
    target_lang="en-US",
    verbose=True,
)

t0 = time.perf_counter()
result = model.transcribe([wav], override_config=trcfg)
torch.cuda.synchronize()
print("transcribe_seconds", round(time.perf_counter() - t0, 3))
print("result", result)
print("peak_vram_gib", round(torch.cuda.max_memory_allocated() / 1024**3, 3))
```

Observed successful run:

```text
load_seconds 38.029
device cuda:0
transcribe_seconds 1.331
peak_vram_gib 4.822
```

Recognized text:

```text
This is a rock Sim X radiology voice X please switch the long window. <en-US>
```

Interpretation:

- The GPU and NeMo runtime are working.
- The model is fast enough for local command/dictation experiments on this L40S after load.
- The synthetic `espeak-ng` voice is not a good accuracy benchmark; `RadSysX` and `lung` were misrecognized.
- We need a small human-recorded voice fixture with consent for a fair command-language test.
- For batch/offline smoke with the current package, use `RNNTPromptTranscribeConfig(use_lhotse=False, target_lang="en-US")`.
- For the actual RadSysX voice sidebar, NeMo's cache-aware streaming inference path is more relevant than the convenience `transcribe()` path.

### Cache-Aware Streaming Example

Cloned NeMo to `/tmp/NeMo` on the VM for example-script inspection only:

```bash
git clone --depth 1 --filter=blob:none https://github.com/NVIDIA/NeMo /tmp/NeMo
cd /tmp/NeMo
git rev-parse --short HEAD
```

Observed NeMo example commit:

```text
95f9273
```

That matches the installed `nemo_toolkit` source version prefix: `3.1.0+95f92737c`.

The cache-aware streaming script exists at:

```text
/tmp/NeMo/examples/asr/asr_cache_aware_streaming/speech_to_text_cache_aware_streaming_infer.py
```

Help/config confirmed support for:

- `pretrained_name`
- `audio_file`
- `dataset_manifest`
- `chunk_size`
- `shift_size`
- `left_chunks`
- `att_context_size`
- `cuda`
- `target_lang`
- `strip_lang_tags`
- `compare_vs_offline`

Single-file run:

```bash
cd /tmp/NeMo
/usr/bin/time -f "wall_seconds %e" \
  /home/eclypso/a0/RadSysX/.venv-ai/bin/python \
  examples/asr/asr_cache_aware_streaming/speech_to_text_cache_aware_streaming_infer.py \
  pretrained_name=nvidia/nemotron-3.5-asr-streaming-0.6b \
  audio_file=/home/eclypso/a0/RadSysX/tmp/ai-audio/radsysx_voice_test_16k.wav \
  cuda=0 \
  target_lang=en-US \
  strip_lang_tags=true
```

Result:

- The streaming model path itself worked and produced a final transcript.
- The script then exited non-zero because the single-`audio_file` branch references manifest-only variables after streaming completes.

Observed failure tail:

```text
Final streaming transcriptions: ['This is a rock Sim X radiology voice X please switch the long window.']
UnboundLocalError: cannot access local variable 'all_refs_text' where it is not associated with a value
wall_seconds 59.56
```

Clean manifest workaround:

```bash
cd /home/eclypso/a0/RadSysX
mkdir -p tmp/ai-audio/asr-out
printf "%s\n" \
  "{\"audio_filepath\": \"/home/eclypso/a0/RadSysX/tmp/ai-audio/radsysx_voice_test_16k.wav\", \"text\": \"This is a RadSysX radiology voice test. Please switch to lung window.\"}" \
  > tmp/ai-audio/nemotron_manifest.json

cd /tmp/NeMo
export HF_HOME="$HOME/.cache/radsysx/models/huggingface"
/usr/bin/time -f "wall_seconds %e" \
  /home/eclypso/a0/RadSysX/.venv-ai/bin/python \
  examples/asr/asr_cache_aware_streaming/speech_to_text_cache_aware_streaming_infer.py \
  pretrained_name=nvidia/nemotron-3.5-asr-streaming-0.6b \
  dataset_manifest=/home/eclypso/a0/RadSysX/tmp/ai-audio/nemotron_manifest.json \
  batch_size=1 \
  output_path=/home/eclypso/a0/RadSysX/tmp/ai-audio/asr-out \
  cuda=0 \
  target_lang=en-US \
  strip_lang_tags=true
```

Observed clean result:

```text
CacheAwareStreamingConfig(chunk_size=[25, 32], shift_size=[25, 32], cache_drop_size=0, last_channel_cache_size=56, valid_out_len=4, pre_encode_cache_size=[0, 9], drop_extra_pre_encoded=2, last_channel_num=0, last_time_num=0)
Inference prompt set to 'en-US' (index 0)
Setting strip_lang_tags to True with lang_tag_pattern='\\s*<[a-z]{2}-[A-Z]{2}>'
Final streaming transcriptions: ['This is a rock Sim X radiology voice X please switch the long window.']
WER% of streaming mode: 58.33
The whole streaming process took: 0.72s
wall_seconds 47.65
```

Interpretation:

- The official cache-aware streaming path runs on the L40S with `target_lang=en-US`.
- The script's streaming compute over the 4.35 second synthetic utterance reported `0.72s`, but the full CLI wall time was `47.65s` because each invocation loads the model. A RadSysX ASR worker should be a resident process that keeps the model warm.
- The single-file CLI branch has a small upstream example-script bug after successful transcription. Use a manifest for clean smoke runs or patch locally if a direct single-file smoke becomes important.
- The first streaming run without `HF_HOME` exported used the default `~/.cache/huggingface` path. Future worker/runbooks should always set `HF_HOME` or the model cache path before invoking example scripts.
- Accuracy remains a poor benchmark on synthetic `espeak-ng` audio. Human voice fixtures are needed before judging model quality.

## MedGemma

### MedGemma 27B Superseded Probe

`google/medgemma-27b-it` was briefly tested after authenticated access succeeded. This is useful ceiling evidence, but it is no longer the preferred local model lane because `google/medgemma-1.5-4b-it` is much smaller and better matched to the desktop fast path.

Observed `google/medgemma-27b-it` metadata:

```text
sha 2d3e00ea38b50018bf5dd3aa1009457cd2d5a48f
gated auto
file_count 25
total_file_bytes 54904380167
metadata.total_parameters 28842036848
metadata.total_size 54864813280
unique_safetensor_shards 12
```

A full BF16 load is not appropriate for the L40S because the safetensors alone are about 54.9 GB and `nvidia-smi` reports about 46 GB usable VRAM.

4-bit text-only smoke:

```text
torch 2.12.0+cu130
transformers 5.12.0
bitsandbytes 0.49.2
processor_loaded_seconds 4.233
model_loaded_seconds 146.761
vram_after_load_gib 15.148
peak_vram_after_load_gib 15.155
generate_seconds 2.021
new_tokens 17
output RadSysX is developing a platform for AI-powered medical image analysis.
peak_vram_total_gib 15.4
```

An attempted public-image smoke was interrupted after the user clarified that the 27B path is unnecessary for the current experiment. The process exited and the GPU returned to `0 MiB` used. The 27B cache occupied about 52 GB on disk afterward; disk headroom remained about 1.2 TB.

### MedGemma 1.5 4B

Preferred first local image/text LLM lane: `google/medgemma-1.5-4b-it`.

Observed metadata:

```text
sha 91850547d9f0b2fdd21aa7c5f4f3d1a8a52c243b
gated auto
tags transformers,safetensors,image-text-to-text,medical,license:other
file_count 15
total_file_bytes 8639646105
safetensor_shards 2
```

Small gated files and both safetensor shards downloaded successfully after authenticated access was fixed.

BF16 text smoke:

```text
torch 2.12.0+cu130
transformers 5.12.0
cuda_available True
gpu NVIDIA L40S
load_seconds 31.685
vram_after_load_gib 8.01
peak_vram_after_load_gib 8.01
text_generate_seconds 0.927
text_new_tokens 18
text_output RadSysX is trying to build a platform for AI-powered medical imaging analysis.
```

The first image smoke attempted a remote Wikimedia URL from the model-card style example, but PIL could not identify the returned response. A deterministic synthetic non-clinical image was used instead.

BF16 synthetic-image smoke:

```text
load_seconds 5.9
vram_after_load_gib 8.01
image_generate_seconds 2.225
image_new_tokens 60
image_output The image displays a dark background. Within this background, there is a light blue rectangle. Inside the rectangle, there is a green circle. The circle is positioned slightly off-center within the rectangle. The text "RadSysX synthetic image" is visible at the bottom of the image.
peak_vram_total_gib 8.124
```

Interpretation:

- MedGemma 1.5 4B is the practical MedGemma candidate for the first local RadSysX assistant worker.
- BF16 fits comfortably on the L40S, with about 8.1 GiB peak VRAM in the smoke tests.
- Cached load is fast enough for worker startup experiments; a resident worker is still preferable for user-facing latency.
- The synthetic image proves multimodal plumbing. Next image tests should use non-PHI radiology fixtures or public medical images with robust local download/caching.

## Pillar0-Sybil-1.5

Source snapshot checked 2026-06-13:

- Model: `YalaLab/Pillar0-Sybil-1.5`
- Finetuning code: <https://github.com/YalaLab/pillar-finetune>
- Base model used by the official CSV config: `YalaLab/Pillar0-ChestCT`

Authenticated access succeeded for Sybil and Pillar-0 base models after the user fixed Hugging Face gating:

```text
YalaLab/Pillar0-Sybil-1.5 sha 8822380c58ce4d111486bce319a9ff226fd80537 gated auto license:ecl-2.0
YalaLab/Pillar0-ChestCT sha b9dfd833a947744382d4f1bd73b5dd72fcb58b34 gated auto license:ecl-2.0
YalaLab/Pillar0-HeadCT sha cabbd28e9c2699420c400ae42a751541ffc66bdd gated auto license:ecl-2.0
YalaLab/Pillar0-AbdomenCT sha d73d111bb278b3f6411f3c8e72c7e6f8a5fb1bb8 gated auto license:ecl-2.0
YalaLab/Pillar0-BreastMRI sha be5050ba482607f90e607e044f03a2ebc38f98c3 gated auto license:ecl-2.0
```

The official `pillar-finetune` setup expects Python `>=3.10,<3.11`. The Ubuntu VM only has system Python 3.12, so `uv` was used to create an isolated Python 3.10.20 environment in `/tmp/pillar-finetune/.venv`.

The normal `uv sync` path failed on `flash-attn==2.8.3` because the VM does not have `nvcc` and `flash-attn`'s build metadata imports `torch` during build:

```text
ModuleNotFoundError: No module named 'torch'
hint: flash-attn depends on torch, but does not declare it as a build dependency
```

No `pillar-finetune` or Pillar-0 source file imported `flash_attn` in the official example path, so a no-FlashAttention test environment was created:

```bash
cd /tmp/pillar-finetune
export UV_CACHE_DIR="$HOME/.cache/radsysx/uv"
uv venv --python 3.10
uv export --no-dev --format requirements-txt --no-hashes \
  | awk 'tolower($0) !~ /flash-attn/ && $0 != "-e ."' \
  > /tmp/pillar-req-no-project-no-flash.txt
uv pip install -r /tmp/pillar-req-no-project-no-flash.txt
uv pip install -e . --no-deps
```

Observed environment:

```text
python 3.10.20
torch 2.8.0+cu128
cuda True
transformers 4.55.2
rad-vision-engine 1.0.0 from YalaLab/rave commit 20adeb873021c864e9410fae8898b0c8da309769
```

Official single-seed Sybil example smoke:

```bash
cd /tmp/pillar-finetune
. .venv/bin/activate
export HF_HOME="$HOME/.cache/radsysx/models/huggingface"
export HF_XET_HIGH_PERFORMANCE=1
export CUDA_VISIBLE_DEVICES=0
export OMP_NUM_THREADS=2
export NUM_GPUS=1
export MASTER_PORT=2300
export WANDB_MODE=disabled
hf download YalaLab/Pillar0-Sybil-1.5 --local-dir logs/checkpoints
/usr/bin/time -f "wall_seconds %e" \
  torchrun --nproc_per_node=1 --master_port=2300 \
  scripts/train.py configs/csv_dataset.yaml \
  --resume logs/checkpoints/seed0/epoch=2.ckpt \
  --evaluate \
  --opts \
  experiment.name seed0 \
  engine.max_epochs 3 \
  main.disable_wandb True \
  dataloader.num_workers 0 \
  dataloader.multi_gpu_eval False
```

Observed result:

```text
Loading YalaLab/Pillar0-ChestCT with revision main from HuggingFace
Model loaded successfully on device: cuda
Resuming from checkpoint: logs/checkpoints/seed0/epoch=2.ckpt
test dataset size: 1
test_loss: 0.6579
Test time: 0.89s
wall_seconds 14.10
```

Generated CSV:

```csv
accession,survival,time_at_event,y
example,[-2.21875 -2.21875 -2.21875 -2.21875 -2.21875 -2.21875],3,1
```

Interpretation:

- Sybil-1.5 and the Pillar0-ChestCT base model can run on the L40S with the included non-PHI RVE example.
- The output is a risk-model smoke only. It is not a generic lesion detector, not a segmentation model, and not a clinical validation.
- The no-FlashAttention environment is acceptable for this one-row evaluation smoke, but a maintained worker should decide whether to install CUDA toolkit/`nvcc`, use an upstream wheel, or keep the no-FlashAttention path if performance remains acceptable.

## Current Conclusions

- The NVIDIA/Linux worker lane is viable for the first local realtime ASR experiments.
- Nemotron 3.5 ASR is public and loaded successfully without a Hugging Face token.
- The L40S has ample headroom for the 0.6B ASR model; observed peak was about 4.82 GiB VRAM.
- NeMo's official cache-aware streaming simulation ran successfully through a manifest with `target_lang=en-US`.
- MedGemma 1.5 4B is the preferred first local image/text LLM candidate; BF16 load and text/image smokes succeeded around 8.1 GiB peak VRAM.
- MedGemma 27B can run in 4-bit for text on this L40S, but it is superseded for the near-term RadSysX local path by MedGemma 1.5 4B.
- Sybil-1.5 can run through the official `pillar-finetune` one-row RVE example after authenticated access to Sybil and Pillar0-ChestCT is available.
- A local ASR worker should be isolated from the clinical app process and communicate through a narrow backend contract.
- API realtime remains a legitimate lane for machines without GPUs, Apple Silicon/Metal users, Windows workstations, and governed hospital deployments.
- The Electron app itself should stay cross-platform. Only the heavy local model runner should be hardware-specific.

## Open Issues

- User still planned external rotation of the temporary Hugging Face token; VM cache removal is complete.
- Need evaluate BiomedParse after its license/model terms are fully separated and recorded.
- Need to verify each model/checkpoint license and clinical/research restrictions separately before distribution.
- Need choose whether RadSysX should keep a no-FlashAttention Sybil worker setup or install the CUDA toolkit/`nvcc` path required by the upstream `flash-attn` dependency.
- Need to turn the NeMo streaming smoke into a resident worker and test low-latency chunked microphone streaming with `target_lang=en-US` and `target_lang=auto`.
- Need to decide whether to patch around the upstream single-`audio_file` example-script post-processing bug or simply keep using manifests for CLI smoke tests.
- Need to replace deprecated `HF_HUB_ENABLE_HF_TRANSFER` with `HF_XET_HIGH_PERFORMANCE` in future remote setup docs.
- Need real microphone/audio capture tests from Electron on Linux, macOS, and Windows.
- Need decide whether the first ASR transport between Electron and backend should be WebSocket PCM, WebRTC local loopback, or a provider-shaped abstraction with interchangeable adapters.
- Need de-identification and consent policy before any real clinical audio or PHI-bearing image context touches external APIs.
- Need a local model registry/capability endpoint so the sidebar can show voice availability without exposing low-level CUDA/NeMo details.

## Next Experiment Checklist

1. Configure Hugging Face auth on the GPU VM using a user-provided token or `huggingface-cli login`.
2. Accept model terms for the gated models from the user's Hugging Face account.
3. Re-run model access probe and record exact access state.
4. Rotate the temporary Hugging Face token externally after the run.
5. Test Nemotron with a short human-recorded command fixture:
   - "RadSysX, switch to lung window."
   - "Measure this lesion."
   - "Attach the current ROI to the chat."
   - "Draft an impression."
6. Run the cache-aware streaming inference path with `target_lang=auto` and compare it with `target_lang=en-US`.
7. Build a tiny resident ASR worker instead of a one-shot CLI invocation.
8. Measure:
   - model load time,
   - first-token or first-partial latency,
   - final transcript latency,
   - realtime factor,
   - peak VRAM,
   - CPU/RAM use,
   - transcript quality on radiology command phrases.
9. Prototype a local ASR worker contract:
   - `POST /api/ai/audio/sessions`,
   - WebSocket stream for PCM chunks,
   - transcript delta events,
   - final transcript event,
   - clean close,
   - capability state.
10. Keep the first worker research-only or pilot-gated until consent, audit, and retention rules are explicit.
11. Turn MedGemma 1.5 4B into a resident local model worker and test non-PHI radiology image fixtures.
12. Evaluate RAVE on local DICOM/NIfTI samples as the imaging preparation layer.
13. Evaluate BiomedParse only after its license/model terms are fully separated and recorded.
14. Evaluate Pillar0-Sybil-1.5 only as a lung cancer risk experiment, not as a general lesion detector.

## Source Links

Checked on 2026-06-12 and 2026-06-13:

- [PyTorch local install selector](https://pytorch.org/get-started/locally/)
- [Google MedGemma 1.5 4B IT](https://huggingface.co/google/medgemma-1.5-4b-it)
- [Google MedGemma 27B IT](https://huggingface.co/google/medgemma-27b-it)
- [YalaLab Pillar0-Sybil-1.5](https://huggingface.co/YalaLab/Pillar0-Sybil-1.5)
- [YalaLab Pillar Finetune](https://github.com/YalaLab/pillar-finetune)
- [NVIDIA Nemotron 3.5 ASR Streaming 0.6B](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b)
- [NVIDIA NeMo repository](https://github.com/NVIDIA/NeMo)
