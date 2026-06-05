#!/bin/bash
# Script to run all end-to-end tests for Brand Digital Twin Phase B.

echo "Running E2E tests for Brand Digital Twin via Blaze..."
blaze test //experimental/brand_twin:e2e_test

