from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Crucial: This allows your friend's frontend to talk to your backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, change "*" to the frontend's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This defines the exact data structure you expect from the frontend
class CGPARequest(BaseModel):
    current_cgpa: float
    completed_sems: int
    total_sems: int
    target_cgpa: float
    max_gpa: float = 10.0
    passing_gpa: float = 4.0

# The API endpoint
@app.post("/calculate-plan")
def get_cgpa_action_plan(data: CGPARequest):
    remaining_sems = data.total_sems - data.completed_sems
    
    if remaining_sems <= 0:
        return {"status": "Error", "message": "Degree already completed!"}

    # 1. Calculate Required Average
    required_total_points = data.target_cgpa * data.total_sems
    current_total_points = data.current_cgpa * data.completed_sems
    required_remaining_points = required_total_points - current_total_points
    
    req_avg_sgpa = round(required_remaining_points / remaining_sems, 2)

    # 2. Feasibility Checks
    if req_avg_sgpa > data.max_gpa:
        max_possible_cgpa = round((current_total_points + (data.max_gpa * remaining_sems)) / data.total_sems, 2)
        return {
            "status": "Impossible", 
            "message": f"Mathematically impossible. The highest CGPA you can reach is {max_possible_cgpa}."
        }
        
    if req_avg_sgpa <= data.passing_gpa:
        return {
            "status": "Secured", 
            "message": f"Target secured! You only need a {req_avg_sgpa} average. Just maintain the minimum passing grade of {data.passing_gpa}."
        }

    # 3. Strategy Generation
    even_plan = [req_avg_sgpa] * remaining_sems
    
    momentum_plan = []
    if remaining_sems > 1:
        max_allowable_step = (data.max_gpa - req_avg_sgpa) / ((remaining_sems - 1) / 2)
        step = min(0.4, max_allowable_step) 
        
        for i in range(remaining_sems):
            offset = i - ((remaining_sems - 1) / 2)
            sgpa_target = round(req_avg_sgpa + (offset * step), 2)
            momentum_plan.append(sgpa_target)
    else:
        momentum_plan = even_plan

    # The backend sends this dictionary back to the frontend as JSON
    return {
        "status": "Achievable",
        "required_average_sgpa": req_avg_sgpa,
        "path_a_even_split": even_plan,
        "path_b_momentum_builder": momentum_plan
    }