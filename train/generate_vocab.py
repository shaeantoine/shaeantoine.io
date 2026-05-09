"""Generate vocab.txt with the standard Shakespeare character set."""
import os

# Standard tinyshakespeare vocabulary (65 chars)
chars = ['\n', ' ', '!', '$', '&', "'", ',', '-', '.', '3', ':', ';', '?',
         'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
         'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
         'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
         'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']

assert len(chars) == 65, f"Expected 65, got {len(chars)}"

out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "weights", "vocab.txt")
with open(out_path, 'w') as f:
    for ch in chars:
        if ch == '\n':
            f.write('\\n\n')  # represent newline as literal \n
        else:
            f.write(ch + '\n')

print(f"Wrote {len(chars)} characters to {out_path}")
