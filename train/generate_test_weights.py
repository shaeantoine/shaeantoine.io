"""
Generate random weights for testing the WASM model end-to-end.
These weights won't produce meaningful text but will verify the pipeline works.
Replace with trained weights from train.py for actual use.
"""

import struct
import os
import random

VOCAB_SIZE = 65
EMBED_DIM = 64
N_LAYERS = 2
CONTEXT_LEN = 128
FFN_DIM = 256

random.seed(42)

def rand_weights(n, scale=0.02):
    return [random.gauss(0, scale) for _ in range(n)]

def ones(n):
    return [1.0] * n

def zeros(n):
    return [0.0] * n

weights = []

# Token embeddings [vocab_size x embed_dim]
weights.extend(rand_weights(VOCAB_SIZE * EMBED_DIM))

# Position embeddings [context_len x embed_dim]
weights.extend(rand_weights(CONTEXT_LEN * EMBED_DIM))

# Per-layer weights
for _ in range(N_LAYERS):
    # ln1 weight (ones) and bias (zeros)
    weights.extend(ones(EMBED_DIM))
    weights.extend(zeros(EMBED_DIM))

    # Q, K, V, attn_out weights [embed_dim x embed_dim]
    weights.extend(rand_weights(EMBED_DIM * EMBED_DIM))
    weights.extend(rand_weights(EMBED_DIM * EMBED_DIM))
    weights.extend(rand_weights(EMBED_DIM * EMBED_DIM))
    weights.extend(rand_weights(EMBED_DIM * EMBED_DIM))

    # ln2 weight (ones) and bias (zeros)
    weights.extend(ones(EMBED_DIM))
    weights.extend(zeros(EMBED_DIM))

    # FFN up weight [embed_dim x ffn_dim] and bias [ffn_dim]
    weights.extend(rand_weights(EMBED_DIM * FFN_DIM))
    weights.extend(zeros(FFN_DIM))

    # FFN down weight [ffn_dim x embed_dim] and bias [embed_dim]
    weights.extend(rand_weights(FFN_DIM * EMBED_DIM))
    weights.extend(zeros(EMBED_DIM))

# Final layer norm
weights.extend(ones(EMBED_DIM))
weights.extend(zeros(EMBED_DIM))

# Output projection [embed_dim x vocab_size]
weights.extend(rand_weights(EMBED_DIM * VOCAB_SIZE))

# Write as raw f32
out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "weights")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "base.bin")

with open(out_path, 'wb') as f:
    for w in weights:
        f.write(struct.pack('<f', w))

print(f"Generated {len(weights):,} weight values")
print(f"Binary size: {len(weights) * 4:,} bytes ({len(weights) * 4 / 1024:.1f} KB)")
print(f"Written to: {out_path}")
