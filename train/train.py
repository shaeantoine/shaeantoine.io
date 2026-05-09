"""
Train a tiny transformer on Shakespeare and export weights for the WASM model.

Architecture must match the Zig implementation exactly:
- vocab_size: 65 (characters)
- embed_dim: 64
- n_layers: 2
- n_heads: 2
- head_dim: 32
- context_len: 128
- ffn_dim: 256
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import os
import urllib.request

# Hyperparameters
VOCAB_SIZE = 65
EMBED_DIM = 64
N_LAYERS = 2
N_HEADS = 2
HEAD_DIM = EMBED_DIM // N_HEADS
CONTEXT_LEN = 128
FFN_DIM = 256
BATCH_SIZE = 64
LEARNING_RATE = 3e-4
MAX_ITERS = 5000
EVAL_INTERVAL = 500
EVAL_ITERS = 200


class MultiHeadAttention(nn.Module):
    def __init__(self):
        super().__init__()
        self.q_proj = nn.Linear(EMBED_DIM, EMBED_DIM, bias=False)
        self.k_proj = nn.Linear(EMBED_DIM, EMBED_DIM, bias=False)
        self.v_proj = nn.Linear(EMBED_DIM, EMBED_DIM, bias=False)
        self.out_proj = nn.Linear(EMBED_DIM, EMBED_DIM, bias=False)
        self.register_buffer(
            "mask", torch.tril(torch.ones(CONTEXT_LEN, CONTEXT_LEN)).view(1, 1, CONTEXT_LEN, CONTEXT_LEN)
        )

    def forward(self, x):
        B, T, C = x.shape
        q = self.q_proj(x).view(B, T, N_HEADS, HEAD_DIM).transpose(1, 2)
        k = self.k_proj(x).view(B, T, N_HEADS, HEAD_DIM).transpose(1, 2)
        v = self.v_proj(x).view(B, T, N_HEADS, HEAD_DIM).transpose(1, 2)

        att = (q @ k.transpose(-2, -1)) * (HEAD_DIM ** -0.5)
        att = att.masked_fill(self.mask[:, :, :T, :T] == 0, float('-inf'))
        att = F.softmax(att, dim=-1)

        out = att @ v
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(out)


class FeedForward(nn.Module):
    def __init__(self):
        super().__init__()
        self.up = nn.Linear(EMBED_DIM, FFN_DIM)
        self.down = nn.Linear(FFN_DIM, EMBED_DIM)

    def forward(self, x):
        return self.down(F.gelu(self.up(x)))


class TransformerBlock(nn.Module):
    def __init__(self):
        super().__init__()
        self.ln1 = nn.LayerNorm(EMBED_DIM)
        self.attn = MultiHeadAttention()
        self.ln2 = nn.LayerNorm(EMBED_DIM)
        self.ffn = FeedForward()

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.ffn(self.ln2(x))
        return x


class TinyTransformer(nn.Module):
    def __init__(self):
        super().__init__()
        self.token_emb = nn.Embedding(VOCAB_SIZE, EMBED_DIM)
        self.pos_emb = nn.Embedding(CONTEXT_LEN, EMBED_DIM)
        self.blocks = nn.ModuleList([TransformerBlock() for _ in range(N_LAYERS)])
        self.ln_f = nn.LayerNorm(EMBED_DIM)
        self.output = nn.Linear(EMBED_DIM, VOCAB_SIZE, bias=False)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        tok_emb = self.token_emb(idx)
        pos_emb = self.pos_emb(torch.arange(T, device=idx.device))
        x = tok_emb + pos_emb

        for block in self.blocks:
            x = block(x)

        x = self.ln_f(x)
        logits = self.output(x)

        if targets is None:
            return logits, None

        B, T, C = logits.shape
        loss = F.cross_entropy(logits.view(B * T, C), targets.view(B * T))
        return logits, loss

    def generate(self, idx, max_tokens):
        for _ in range(max_tokens):
            idx_crop = idx[:, -CONTEXT_LEN:]
            logits, _ = self(idx_crop)
            logits = logits[:, -1, :]
            probs = F.softmax(logits, dim=-1)
            next_tok = torch.multinomial(probs, num_samples=1)
            idx = torch.cat([idx, next_tok], dim=1)
        return idx


def get_shakespeare():
    data_path = os.path.join(os.path.dirname(__file__), "shakespeare.txt")
    if not os.path.exists(data_path):
        url = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"
        print(f"Downloading Shakespeare from {url}...")
        urllib.request.urlretrieve(url, data_path)
    with open(data_path, 'r') as f:
        return f.read()


def train():
    device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Using device: {device}")

    text = get_shakespeare()
    chars = sorted(list(set(text)))
    vocab_size = len(chars)
    print(f"Vocabulary size: {vocab_size} characters")
    assert vocab_size <= VOCAB_SIZE, f"Text has {vocab_size} unique chars, expected <= {VOCAB_SIZE}"

    stoi = {ch: i for i, ch in enumerate(chars)}
    itos = {i: ch for i, ch in enumerate(chars)}

    # Save char mapping for JS tokenizer
    with open(os.path.join(os.path.dirname(__file__), "vocab.txt"), 'w') as f:
        for i in range(vocab_size):
            f.write(f"{itos[i]}\n")

    encode = lambda s: [stoi[c] for c in s]
    data = torch.tensor(encode(text), dtype=torch.long)

    n = int(0.9 * len(data))
    train_data = data[:n]
    val_data = data[n:]

    def get_batch(split):
        d = train_data if split == 'train' else val_data
        ix = torch.randint(len(d) - CONTEXT_LEN, (BATCH_SIZE,))
        x = torch.stack([d[i:i + CONTEXT_LEN] for i in ix])
        y = torch.stack([d[i + 1:i + CONTEXT_LEN + 1] for i in ix])
        return x.to(device), y.to(device)

    @torch.no_grad()
    def estimate_loss(model):
        model.eval()
        out = {}
        for split in ['train', 'val']:
            losses = torch.zeros(EVAL_ITERS)
            for k in range(EVAL_ITERS):
                X, Y = get_batch(split)
                _, loss = model(X, Y)
                losses[k] = loss.item()
            out[split] = losses.mean()
        model.train()
        return out

    model = TinyTransformer().to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {n_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)

    for iter in range(MAX_ITERS):
        if iter % EVAL_INTERVAL == 0:
            losses = estimate_loss(model)
            print(f"Step {iter}: train loss {losses['train']:.4f}, val loss {losses['val']:.4f}")

        xb, yb = get_batch('train')
        _, loss = model(xb, yb)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

    # Final evaluation
    losses = estimate_loss(model)
    print(f"Final: train loss {losses['train']:.4f}, val loss {losses['val']:.4f}")

    # Generate sample
    context = torch.zeros((1, 1), dtype=torch.long, device=device)
    generated = model.generate(context, max_tokens=200)
    print("\nGenerated sample:")
    print(''.join([itos[i] for i in generated[0].tolist()]))

    # Save PyTorch checkpoint
    torch.save(model.state_dict(), os.path.join(os.path.dirname(__file__), "model.pt"))
    print("\nSaved model.pt")

    # Export weights
    export_weights(model)


def export_weights(model):
    """Export weights in the exact binary format the Zig WASM code expects."""
    out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "weights", "base.bin")

    weights = []

    # 1. Token embeddings [vocab_size x embed_dim]
    weights.append(model.token_emb.weight.data.cpu().float())

    # 2. Position embeddings [context_len x embed_dim]
    weights.append(model.pos_emb.weight.data.cpu().float())

    # 3. Per-layer weights
    for block in model.blocks:
        # ln1 weight and bias
        weights.append(block.ln1.weight.data.cpu().float())
        weights.append(block.ln1.bias.data.cpu().float())

        # Q, K, V weights [embed_dim x embed_dim] — stored as transposed for matmul_transb
        weights.append(block.attn.q_proj.weight.data.cpu().float())
        weights.append(block.attn.k_proj.weight.data.cpu().float())
        weights.append(block.attn.v_proj.weight.data.cpu().float())

        # Attention output projection
        weights.append(block.attn.out_proj.weight.data.cpu().float())

        # ln2 weight and bias
        weights.append(block.ln2.weight.data.cpu().float())
        weights.append(block.ln2.bias.data.cpu().float())

        # FFN up weight and bias [embed_dim x ffn_dim] (transposed)
        weights.append(block.ffn.up.weight.data.cpu().float())
        weights.append(block.ffn.up.bias.data.cpu().float())

        # FFN down weight and bias [ffn_dim x embed_dim] (transposed)
        weights.append(block.ffn.down.weight.data.cpu().float())
        weights.append(block.ffn.down.bias.data.cpu().float())

    # 4. Final layer norm
    weights.append(model.ln_f.weight.data.cpu().float())
    weights.append(model.ln_f.bias.data.cpu().float())

    # 5. Output projection [embed_dim x vocab_size] (transposed)
    weights.append(model.output.weight.data.cpu().float())

    # Concatenate all weights into a single flat f32 array
    all_weights = torch.cat([w.flatten() for w in weights])
    print(f"Total weight elements: {all_weights.numel():,}")
    print(f"Binary size: {all_weights.numel() * 4:,} bytes ({all_weights.numel() * 4 / 1024:.1f} KB)")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    all_weights.numpy().tofile(out_path)
    print(f"Exported to {out_path}")


if __name__ == "__main__":
    train()
