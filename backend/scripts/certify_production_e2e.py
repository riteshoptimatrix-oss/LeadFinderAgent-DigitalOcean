import asyncio
import argparse
import sys
import os
from typing import List

# Setup path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from tests.e2e_certification.test_functional_e2e import run_functional_tests
from tests.e2e_certification.test_recovery_e2e import run_recovery_tests
from tests.e2e_certification.test_performance_e2e import run_performance_tests

class Color:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    RESET = '\033[0m'

async def run_certification(headful: bool = False):
    print("=========================================================")
    print(" LEAD FINDER AGENT - REAL E2E CERTIFICATION RUNNER")
    print("=========================================================")
    
    results = {
        "Functional E2E": {"status": "PENDING", "errors": []},
        "Recovery E2E": {"status": "PENDING", "errors": []},
        "Performance E2E": {"status": "PENDING", "errors": []},
    }

    try:
        # 1. Functional Tests
        print(f"\n[{Color.YELLOW}RUNNING{Color.RESET}] 1/3 Functional E2E (Hitting actual API and waiting for Mongo)...")
        errors = await run_functional_tests(headful)
        if errors:
            results["Functional E2E"] = {"status": "FAIL", "errors": errors}
        else:
            results["Functional E2E"] = {"status": "PASS", "errors": []}
            
        # 2. Recovery Tests
        print(f"\n[{Color.YELLOW}RUNNING{Color.RESET}] 2/3 Recovery E2E (Triggering Watchdog)...")
        errors = await run_recovery_tests(headful)
        if errors:
            results["Recovery E2E"] = {"status": "FAIL", "errors": errors}
        else:
            results["Recovery E2E"] = {"status": "PASS", "errors": []}
            
        # 3. Performance Tests
        print(f"\n[{Color.YELLOW}RUNNING{Color.RESET}] 3/3 Performance E2E (Memory Baseline)...")
        errors = await run_performance_tests(headful)
        if errors:
            results["Performance E2E"] = {"status": "WARN", "errors": errors}
        else:
            results["Performance E2E"] = {"status": "PASS", "errors": []}

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"\n{Color.RED}FATAL RUNNER ERROR: {str(e)}\n{tb}{Color.RESET}")
        
    print("\n=========================================================")
    print(" REAL E2E CERTIFICATION REPORT")
    print("=========================================================")
    
    all_passed = True
    for test_name, result in results.items():
        status = result["status"]
        color = Color.GREEN if status == "PASS" else Color.RED if status == "FAIL" else Color.YELLOW
        print(f"{test_name.ljust(15)} : [{color}{status}{Color.RESET}]")
        if status != "PASS":
            all_passed = False
        if result["errors"]:
            for err in result["errors"]:
                print(f"  -> {err}")
                 
    print("\n=========================================================")
    if all_passed:
        print(f" {Color.GREEN}PRODUCTION CERTIFICATION: GRANTED{Color.RESET}")
        print(" All end-to-end components are fault-tolerant and stable.")
    else:
        print(f" {Color.RED}PRODUCTION CERTIFICATION: DENIED{Color.RESET}")
        print(" Resolve the failing defects before moving to production.")
    print("=========================================================\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--headful", action="store_true", help="Run browsers in visible mode")
    args = parser.parse_args()
    
    asyncio.run(run_certification(args.headful))
