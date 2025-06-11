# from fastapi import FastAPI, Request
# from fastapi.responses import HTMLResponse
# from fastapi.templating import Jinja2Templates
# import os

# print("=== DEBUG: FastAPI app is starting... ===")
# print(f"=== DEBUG: Current working directory: {os.getcwd()} ===")
# print(f"=== DEBUG: Directory contents: {os.listdir('.')} ===")

# app = FastAPI()
# print("=== DEBUG: FastAPI instance created ===")

# # Check if templates directory exists
# if os.path.exists("templates"):
#     print(f"=== DEBUG: Templates directory found: {os.listdir('templates')} ===")
# else:
#     print("=== DEBUG: Templates directory NOT found ===")

# templates = Jinja2Templates(directory="templates")
# print("=== DEBUG: Jinja2Templates configured ===")

# @app.get("/", response_class=HTMLResponse)
# async def landing(request: Request): 
#     print("=== DEBUG: Root endpoint called ===")
#     return templates.TemplateResponse("index.html", {"request": request})

# @app.get("/about", response_class=HTMLResponse)
# async def about(request: Request): 
#     print("=== DEBUG: About endpoint called ===")
#     return templates.TemplateResponse("about.html", {"request": request})

# print("=== DEBUG: All routes configured ===")



# from fastapi import FastAPI
# from fastapi.responses import HTMLResponse

# print("=== STARTING FASTAPI APP ===")

# app = FastAPI()

# @app.get("/")
# async def root():
#     print("=== ROOT ENDPOINT HIT ===")
#     return {"message": "Hello World"}

# @app.get("/health")
# async def health():
#     return {"status": "ok"}

# print("=== FASTAPI APP CONFIGURED ===")

from typing import Optional

from fastapi import FastAPI

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/items/{item_id}")
def read_item(item_id: int, q: Optional[str] = None):
    return {"item_id": item_id, "q": q}