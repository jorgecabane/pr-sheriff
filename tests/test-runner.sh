#!/bin/bash
# Script simple para ejecutar tests

echo "Ejecutando tests con vitest..."
npx vitest run --reporter=verbose 2>&1
