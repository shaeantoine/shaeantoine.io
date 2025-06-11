# shaeantoine.io 🚀 

This repo is dedicated for my personal website. It's built using FastAPI and Uvicorn and it's published on Render. It's very much a work in progress. I expect to be periodically adding styling and content upgrades. 

## Project Structure 📁 

```bash
.
├── app/
│   ├── main.py                
│   ├── templates/
│   │   └── index.html         
│   └── static/
│       ├── css/
│       ├── js/
│       └── images/
├── requirements.txt         
├── render.yaml           
└── README.md

```

## Setup (if you wanted to run it locally lol) 
```bash
python -m venv venv
source venv/bin/activate 

pip install -r requirements.txt

uvicorn app.main:app --reload
```

