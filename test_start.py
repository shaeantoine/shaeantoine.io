#!/usr/bin/env python3
import os
import sys

print("=== TEST SCRIPT STARTING ===")
print(f"Python version: {sys.version}")
print(f"Current working directory: {os.getcwd()}")
print(f"Contents of current directory: {os.listdir('.')}")

if os.path.exists('app'):
    print(f"Contents of app directory: {os.listdir('app')}")
else:
    print("No app directory found")

print("=== TEST SCRIPT ENDING ===")
