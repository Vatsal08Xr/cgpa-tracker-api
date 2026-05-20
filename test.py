"""
Tests for CGPA Tracker API v2
Run: pytest test_v2.py -v
"""
import pytest
from fastapi.testclient import TestClient
from main_v2 import app

client = TestClient(app)

GS10 = {
    "scale_max": 10.0, "passing_points": 4.0, "decimal_places": 2,
    "credit_range": [15, 30],
    "grade_map": [
        {"grade": "O", "points": 10.0}, {"grade": "A+", "points": 9.0},
        {"grade": "A", "points": 8.0},  {"grade": "B+", "points": 7.0},
        {"grade": "B", "points": 6.0},  {"grade": "C", "points": 5.0},
        {"grade": "P", "points": 4.0},  {"grade": "F", "points": 0.0},
    ],
}

GS4 = {
    "scale_max": 4.0, "passing_points": 1.0, "decimal_places": 2,
    "credit_range": [12, 21],
    "grade_map": [
        {"grade": "A", "points": 4.0}, {"grade": "B+", "points": 3.3},
        {"grade": "B", "points": 3.0}, {"grade": "C", "points": 2.0},
        {"grade": "D", "points": 1.0}, {"grade": "F", "points": 0.0},
    ],
}

def base_plan(**kw):
    defaults = dict(
        grading_system=GS10,
        academic_state={"current_cgpa": 7.5, "total_credits_earned": 120},
        target_cgpa=8.5, remaining_semesters=4,
        credits_per_remaining_semester=[22, 22, 20, 20],
        effort_pattern="uniform", semester_constraints=[], desired_buffer=0.0,
    )
    defaults.update(kw)
    return defaults

# ── Presets ──────────────────────────────────────────────────────────────────

def test_presets():
    r = client.get("/api/v1/grading-presets")
    assert r.status_code == 200
    assert len(r.json()["presets"]) == 3

# ── Validate ─────────────────────────────────────────────────────────────────

def test_validate_ok():
    r = client.post("/api/v1/validate-grading-system", json=GS10)
    assert r.status_code == 200
    assert r.json()["valid"] is True

def test_validate_grade_max_mismatch():
    bad = {**GS10, "grade_map": [{"grade": "A", "points": 9.0}, {"grade": "F", "points": 0.0}]}
    r = client.post("/api/v1/validate-grading-system", json=bad)
    assert r.status_code == 422

# ── Calculate Plan ────────────────────────────────────────────────────────────

def test_plan_returns_required_fields():
    r = client.post("/api/v1/calculate-plan", json=base_plan())
    assert r.status_code == 200
    d = r.json()
    for key in ("summary", "feasibility", "quality_points_breakdown", "plan", "trajectory", "recommendations"):
        assert key in d

def test_plan_trajectory_chart_friendly():
    r = client.post("/api/v1/calculate-plan", json=base_plan())
    traj = r.json()["trajectory"]
    assert len(traj) == 4
    for pt in traj:
        assert "semester" in pt and "projected_cgpa" in pt and "target_sgpa" in pt

def test_plan_quality_points_breakdown():
    r = client.post("/api/v1/calculate-plan", json=base_plan())
    qp = r.json()["quality_points_breakdown"]
    assert "current_quality_points" in qp
    assert "explanation" in qp
    assert isinstance(qp["explanation"], str) and len(qp["explanation"]) > 10

def test_plan_recommendations_nonempty():
    r = client.post("/api/v1/calculate-plan", json=base_plan())
    recs = r.json()["recommendations"]
    assert isinstance(recs, list) and len(recs) >= 1

def test_plan_semester_constraint():
    payload = base_plan(semester_constraints=[{"semester_index": 1, "max_sgpa": 7.0, "label": "internship"}])
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 200
    plan = r.json()["plan"]
    # Semester index 1 (2nd semester) should respect max_sgpa=7.0
    assert plan[1]["target_sgpa"] <= 7.01  # small float tolerance

def test_plan_desired_buffer():
    payload = base_plan(desired_buffer=0.2)
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 200
    assert r.json()["summary"]["effective_target"] == 8.7

def test_plan_already_achieved():
    payload = base_plan(academic_state={"current_cgpa": 9.2, "total_credits_earned": 120})
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 200
    assert r.json()["feasibility"].get("already_achieved") is True

def test_plan_impossible():
    payload = base_plan(
        academic_state={"current_cgpa": 4.0, "total_credits_earned": 700},
        credits_per_remaining_semester=[20],
        remaining_semesters=1,
    )
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 200
    assert r.json()["feasibility"]["feasible"] is False
    assert r.json()["feasibility"]["risk_level"] == "impossible"
    assert "max_achievable_cgpa" in r.json()["feasibility"]

def test_plan_freshman():
    payload = base_plan(
        academic_state={},
        target_cgpa=8.0,
        remaining_semesters=8,
        credits_per_remaining_semester=[20]*8,
    )
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 200
    assert r.json()["summary"]["current_cgpa"] == 0.0

def test_plan_4pt_scale():
    payload = base_plan(
        grading_system=GS4,
        academic_state={"current_cgpa": 3.0, "total_credits_earned": 60},
        target_cgpa=3.5,
        credits_per_remaining_semester=[15]*4,
    )
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 200
    assert r.json()["feasibility"]["feasible"] is True

def test_plan_semester_history_mode():
    payload = base_plan(academic_state={
        "semester_history": [
            {"semester_number": 1, "sgpa": 7.5, "credits": 60},
            {"semester_number": 2, "sgpa": 8.0, "credits": 60},
        ]
    })
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 200

def test_plan_all_patterns():
    for pattern in ("uniform", "front_loaded", "back_loaded", "stepped_up", "stepped_down"):
        r = client.post("/api/v1/calculate-plan", json=base_plan(effort_pattern=pattern))
        assert r.status_code == 200, f"pattern {pattern} failed: {r.json()}"

def test_plan_grade_labels():
    r = client.post("/api/v1/calculate-plan", json=base_plan())
    for sem in r.json()["plan"]:
        assert "nearest_grade" in sem
        assert sem["nearest_grade"] in {g["grade"] for g in GS10["grade_map"]}

# ── Validation rejections ─────────────────────────────────────────────────────

def test_plan_credits_length_mismatch():
    r = client.post("/api/v1/calculate-plan", json=base_plan(credits_per_remaining_semester=[20, 20]))
    assert r.status_code == 422

def test_plan_target_above_scale():
    r = client.post("/api/v1/calculate-plan", json=base_plan(target_cgpa=11.0))
    assert r.status_code == 422

def test_plan_target_below_passing():
    r = client.post("/api/v1/calculate-plan", json=base_plan(target_cgpa=2.0))
    assert r.status_code == 422

def test_plan_both_modes_rejected():
    payload = base_plan(academic_state={
        "semester_history": [{"semester_number": 1, "sgpa": 7.5, "credits": 20}],
        "current_cgpa": 7.5, "total_credits_earned": 20,
    })
    r = client.post("/api/v1/calculate-plan", json=payload)
    assert r.status_code == 422

# ── Course Plan ───────────────────────────────────────────────────────────────

def course_payload(**kw):
    defaults = dict(
        grading_system=GS10,
        academic_state={"current_cgpa": 7.5, "total_credits_earned": 120},
        target_sgpa=8.5,
        courses=[
            {"name": "Data Structures", "credits": 4, "expected_grade": "A+"},
            {"name": "OS", "credits": 4, "expected_grade": "B+"},
            {"name": "Maths", "credits": 3, "expected_grade": "A"},
        ],
    )
    defaults.update(kw)
    return defaults

def test_course_plan_basic():
    r = client.post("/api/v1/course-plan", json=course_payload())
    assert r.status_code == 200
    d = r.json()
    assert "semester_summary" in d
    assert "sensitivity_ranking" in d
    assert d["semester_summary"]["total_credits"] == 11

def test_course_plan_sgpa_correct():
    # A+ = 9.0 (4 credits), B+ = 7.0 (4 credits), A = 8.0 (3 credits)
    # SGPA = (9*4 + 7*4 + 8*3) / 11 = (36+28+24)/11 = 88/11 = 8.0
    r = client.post("/api/v1/course-plan", json=course_payload())
    assert abs(r.json()["semester_summary"]["projected_sgpa"] - 8.0) < 0.01

def test_course_plan_sensitivity_ranked():
    r = client.post("/api/v1/course-plan", json=course_payload())
    ranking = r.json()["sensitivity_ranking"]
    # All should have a positive gain
    for item in ranking:
        assert item["sgpa_gain_if_upgraded"] > 0

def test_course_plan_invalid_grade():
    payload = course_payload(courses=[{"name": "X", "credits": 3, "expected_grade": "Z+"}])
    r = client.post("/api/v1/course-plan", json=payload)
    assert r.status_code == 422

# ── Sensitivity Analysis ──────────────────────────────────────────────────────

def test_sensitivity_basic():
    payload = {
        "grading_system": GS10,
        "academic_state": {"current_cgpa": 7.5, "total_credits_earned": 120},
        "target_cgpa": 8.5,
        "future_credits": 80,
    }
    r = client.post("/api/v1/sensitivity", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert "marginal_sensitivity" in d
    assert abs(d["marginal_sensitivity"] - 0.4) < 0.001  # 80/(120+80) = 0.4
    assert len(d["sensitivity_table"]) == 10  # auto-grid

def test_sensitivity_custom_probes():
    payload = {
        "grading_system": GS10,
        "academic_state": {"current_cgpa": 7.5, "total_credits_earned": 120},
        "target_cgpa": 8.5,
        "future_credits": 80,
        "probe_sgpa_values": [7.0, 8.0, 9.0, 10.0],
    }
    r = client.post("/api/v1/sensitivity", json=payload)
    assert r.status_code == 200
    assert len(r.json()["sensitivity_table"]) == 4

# ── Simulate ─────────────────────────────────────────────────────────────────

def test_simulate_basic():
    payload = {
        "grading_system": GS10,
        "academic_state": {"current_cgpa": 7.5, "total_credits_earned": 80},
        "planned_semesters": [
            {"semester_number": 1, "sgpa": 9.0, "credits": 20},
            {"semester_number": 2, "sgpa": 8.5, "credits": 20},
        ],
    }
    r = client.post("/api/v1/simulate", json=payload)
    assert r.status_code == 200
    assert r.json()["final_projected_cgpa"] > 7.5

def test_simulate_out_of_range_sgpa():
    payload = {
        "grading_system": GS10,
        "academic_state": {},
        "planned_semesters": [{"semester_number": 1, "sgpa": 11.0, "credits": 20}],
    }
    r = client.post("/api/v1/simulate", json=payload)
    assert r.status_code == 422

# ── Scenario Comparison ───────────────────────────────────────────────────────

def test_compare_scenarios():
    payload = {
        "grading_system": GS10,
        "academic_state": {"current_cgpa": 7.5, "total_credits_earned": 120},
        "scenarios": [
            {"target_cgpa": 8.0, "label": "Comfortable"},
            {"target_cgpa": 8.5, "label": "Stretch"},
            {"target_cgpa": 9.0, "label": "Ambitious"},
        ],
        "remaining_semesters": 4,
        "credits_per_remaining_semester": [20, 20, 20, 20],
    }
    r = client.post("/api/v1/compare-scenarios", json=payload)
    assert r.status_code == 200
    table = r.json()["comparison_table"]
    assert len(table) == 3
    # Required SGPA should increase with target
    sgpas = [row["required_uniform_sgpa"] for row in table]
    assert sgpas[0] < sgpas[1] < sgpas[2]

def test_compare_scenarios_too_few():
    payload = {
        "grading_system": GS10,
        "academic_state": {"current_cgpa": 7.5, "total_credits_earned": 120},
        "scenarios": [{"target_cgpa": 8.0}],  # only 1, need >= 2
        "remaining_semesters": 4,
        "credits_per_remaining_semester": [20]*4,
    }
    r = client.post("/api/v1/compare-scenarios", json=payload)
    assert r.status_code == 422

# ── Academic Health ───────────────────────────────────────────────────────────

def test_health_no_history():
    payload = {"grading_system": GS10, "academic_state": {}}
    r = client.post("/api/v1/academic-health", json=payload)
    assert r.status_code == 200
    assert r.json()["academic_health_score"] is None

def test_health_improving():
    payload = {
        "grading_system": GS10,
        "academic_state": {"semester_history": [
            {"semester_number": 1, "sgpa": 7.0, "credits": 20},
            {"semester_number": 2, "sgpa": 7.5, "credits": 20},
            {"semester_number": 3, "sgpa": 8.0, "credits": 20},
            {"semester_number": 4, "sgpa": 8.5, "credits": 20},
        ]},
    }
    r = client.post("/api/v1/academic-health", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["trend"] == "improving"
    assert isinstance(d["academic_health_score"], float)
    assert d["consistency_score"] > 60  # smooth trend = high consistency

def test_health_volatile():
    payload = {
        "grading_system": GS10,
        "academic_state": {"semester_history": [
            {"semester_number": 1, "sgpa": 9.5, "credits": 20},
            {"semester_number": 2, "sgpa": 5.0, "credits": 20},
            {"semester_number": 3, "sgpa": 9.5, "credits": 20},
            {"semester_number": 4, "sgpa": 5.0, "credits": 20},
        ]},
    }
    r = client.post("/api/v1/academic-health", json=payload)
    assert r.json()["trend"] == "volatile"
