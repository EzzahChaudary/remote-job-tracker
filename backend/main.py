import requests
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker

HEADERS = {"User-Agent": "remote-job-tracker/1.0"}

engine = create_engine("sqlite:///jobs_v2.db", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)
Base = declarative_base()

class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    title = Column(String)
    company = Column(String)
    location = Column(String)
    job_type = Column(String)
    url = Column(String)
    posted = Column(String)
    source = Column(String)
    saved = Column(Boolean, default=False)
    applied = Column(Boolean, default=False)

Base.metadata.create_all(engine)

app = FastAPI(title="Remote Job Tracker")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def to_dict(j):
    return {c.name: getattr(j, c.name) for c in Job.__table__.columns}

def get_json(url, **kwargs):
    r = requests.get(url, headers=HEADERS, timeout=20, **kwargs)
    r.raise_for_status()
    return r.json()

def fetch_remotive(q):
    data = get_json("https://remotive.com/api/remote-jobs", params={"search": q})
    out = []
    for j in data.get("jobs", []):
        out.append({
            "id": f"remotive-{j['id']}",
            "title": j.get("title") or "",
            "company": j.get("company_name") or "",
            "location": j.get("candidate_required_location") or "Anywhere",
            "job_type": j.get("job_type") or "",
            "url": j.get("url") or "",
            "posted": (j.get("publication_date") or "")[:19],
            "source": "Remotive",
            "text": " ".join([j.get("title") or "", j.get("company_name") or "",
                              j.get("category") or "", " ".join(j.get("tags") or [])]),
        })
    return out

def fetch_remoteok(q):
    data = get_json("https://remoteok.com/api")
    out = []
    for j in data:
        if not isinstance(j, dict) or not j.get("id") or not j.get("position"):
            continue  # the first item is a legal notice, skip it
        out.append({
            "id": f"remoteok-{j['id']}",
            "title": j.get("position") or "",
            "company": j.get("company") or "",
            "location": j.get("location") or "Anywhere",
            "job_type": "remote",
            "url": j.get("url") or "",
            "posted": (j.get("date") or "")[:19],
            "source": "Remote OK",
            "text": " ".join([j.get("position") or "", j.get("company") or "",
                              " ".join(j.get("tags") or [])]),
        })
    return out

def fetch_arbeitnow(q):
    data = get_json("https://www.arbeitnow.com/api/job-board-api").get("data", [])
    out = []
    for j in data:
        if not j.get("remote"):
            continue
        created = j.get("created_at")
        posted = ""
        if isinstance(created, (int, float)):
            posted = datetime.fromtimestamp(created, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        types = j.get("job_types") or []
        out.append({
            "id": f"arbeitnow-{j['slug']}",
            "title": j.get("title") or "",
            "company": j.get("company_name") or "",
            "location": j.get("location") or "Europe",
            "job_type": types[0] if types else "",
            "url": j.get("url") or "",
            "posted": posted,
            "source": "Arbeitnow",
            "text": " ".join([j.get("title") or "", j.get("company_name") or "",
                              " ".join(j.get("tags") or []), " ".join(types)]),
        })
    return out

SOURCES = [
    ("Remotive", fetch_remotive),
    ("Remote OK", fetch_remoteok),
    ("Arbeitnow", fetch_arbeitnow),
]

@app.get("/search")
def search_jobs(q: str = "react"):
    collected, failed = [], []
    for name, fetch in SOURCES:
        try:
            collected += fetch(q)
        except (requests.RequestException, ValueError, KeyError):
            failed.append(name)

    if len(failed) == len(SOURCES):
        raise HTTPException(502, "Could not reach any job source. Check your internet connection.")

    words = q.lower().split()
    matched = [j for j in collected if all(w in j["text"].lower() for w in words)]
    matched.sort(key=lambda j: j["posted"], reverse=True)

    db = Session()
    rows = []
    for j in matched:
        job = db.get(Job, j["id"])
        if not job:
            job = Job(**{k: v for k, v in j.items() if k != "text"})
            db.add(job)
        rows.append(job)
    db.commit()
    result = [to_dict(j) for j in rows]
    db.close()
    return {"jobs": result, "failed": failed}

@app.get("/jobs")
def list_jobs(saved: bool = False, applied: bool = False):
    db = Session()
    q = db.query(Job)
    if saved:
        q = q.filter(Job.saved == True)
    if applied:
        q = q.filter(Job.applied == True)
    jobs = [to_dict(j) for j in q.order_by(Job.posted.desc()).all()]
    db.close()
    return jobs

def toggle(job_id: str, field: str):
    db = Session()
    job = db.get(Job, job_id)
    if not job:
        db.close()
        raise HTTPException(404, "Job not found")
    setattr(job, field, not getattr(job, field))
    db.commit()
    result = to_dict(job)
    db.close()
    return result

@app.post("/jobs/{job_id}/save")
def toggle_save(job_id: str):
    return toggle(job_id, "saved")

@app.post("/jobs/{job_id}/applied")
def toggle_applied(job_id: str):
    return toggle(job_id, "applied")