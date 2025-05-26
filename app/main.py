from fastapi import * 

app = FastAPI() 

@app.get("/")
def main(): 
    return {"Hello": "World!"}