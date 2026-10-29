import asyncio
import argparse
import sys
import os
from typing import List

# Setup path so we can import backend modules
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from tests.certification.test_functional import run_functional_tests
from tests.certification.test_recovery import run_recovery_tests
from tests.certification.test_performance import run_performance_tests
from tests.certification.test_data_quality import run_data_quality_tests

class Color:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    RESET = '\033[0m'

async def run_certification(headful: bool = False):
    print("=========================================================")
    print(" LEAD FINDER AGENT - PRODUCTION CERTIFICATION RUNNER")
    print("=========================================================")
    
    results = {
        "Functional": {"status": "PENDING", "errors": []},
        "Recovery": {"status": "PENDING", "errors": []},
        "DataQuality": {"status": "PENDING", "errors": []},
        "Performance": {"status": "PENDING", "errors": []},
    }

    try:
        # 1. Functional Tests
        print(f"\n[{Color.YELLOW}RUNNING{Color.RESET}] 1/4 Functional Tests (End-to-End Pipeline)...")
        errors = await run_functional_tests(headful)
        if errors:
            results["Functional"] = {"status": "FAIL", "errors": errors}
        else:
            results["Functional"] = {"status": "PASS", "errors": []}
            
        # 2. Recovery Tests
        print(f"\n[{Color.YELLOW}RUNNING{Color.RESET}] 2/4 Failure Recovery Tests (Watchdog & Checkpoints)...")
        errors = await run_recovery_tests(headful)
        if errors:
            results["Recovery"] = {"status": "FAIL", "errors": errors}
        else:
            results["Recovery"] = {"status": "PASS", "errors": []}
            
        # 3. Data Quality Tests
        print(f"\n[{Color.YELLOW}RUNNING{Color.RESET}] 3/4 Data Quality Tests (Enrichment & Validity)...")
        errors = await run_data_quality_tests()
        if errors:
            results["DataQuality"] = {"status": "FAIL", "errors": errors}
        else:
            results["DataQuality"] = {"status": "PASS", "errors": []}
            
        # 4. Performance Tests
        print(f"\n[{Color.YELLOW}RUNNING{Color.RESET}] 4/4 Performance Tests (Load & Memory Scaling)...")
        errors = await run_performance_tests(headful)
        if errors:
            results["Performance"] = {"status": "WARN", "errors": errors} # Warn if it's just slow, fail if it crashes
        else:
            results["Performance"] = {"status": "PASS", "errors": []}

    except Exception as e:
        print(f"\n{Color.RED}FATAL RUNNER ERROR: {str(e)}{Color.RESET}")
        
    print("\n=========================================================")
    print(" CERTIFICATION REPORT")
    print("=========================================================")
    
    all_passed = True
    for test_name, result in results.items():
        status = result["status"]
        color = Color.GREEN if status == "PASS" else Color.RED if status == "FAIL" else Color.YELLOW
        print(f"{test_name.ljust(15)} : [{color}{status}{Color.RESET}]")
        if result["errors"]:
            all_passed = False
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
