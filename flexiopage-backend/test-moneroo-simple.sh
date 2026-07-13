#!/bin/bash

# Test simplifié du webhook Moneroo (sans créer de store/produit)

API="http://localhost:5051/api"

echo "=========================================="
echo "🧪 Test Webhook Moneroo"
echo "=========================================="
echo ""

# Génerer un transaction ID unique
TRANSACTION_REF="test_$(date +%s)_$(openssl rand -hex 4)"
ORDER_ID="test_order_$(date +%s)"

echo "Transaction Ref: $TRANSACTION_REF"
echo "Order ID: $ORDER_ID"
echo ""

# Test 1: Webhook success
echo "1️⃣ Simuler webhook Moneroo (SUCCESS)..."
WEBHOOK_RESPONSE=$(curl -s -X POST "$API/webhooks/moneróo" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "'$TRANSACTION_REF'",
    "payment_id": "'$TRANSACTION_REF'",
    "status": "success",
    "amount": 500,
    "currency": "XOF",
    "customer": {
      "email": "test@example.com",
      "phone": "+221771234567"
    },
    "metadata": {
      "order_id": "'$ORDER_ID'",
      "order_number": "001"
    },
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }')

echo "   Response: $WEBHOOK_RESPONSE"
echo ""

# Test 2: Webhook failure
echo "2️⃣ Simuler webhook Moneroo (FAILED)..."
FAILED_TRANSACTION="test_failed_$(date +%s)_$(openssl rand -hex 4)"

WEBHOOK_FAILED=$(curl -s -X POST "$API/webhooks/moneróo" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "'$FAILED_TRANSACTION'",
    "payment_id": "'$FAILED_TRANSACTION'",
    "status": "failed",
    "amount": 500,
    "currency": "XOF",
    "customer": {
      "email": "failed@example.com",
      "phone": "+221771234567"
    },
    "metadata": {
      "order_id": "'$ORDER_ID'",
      "order_number": "002"
    },
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }')

echo "   Response: $WEBHOOK_FAILED"
echo ""

# Test 3: Vérifier les logs de paiement
echo "3️⃣ Vérifier les logs de paiement..."
LOGS=$(curl -s -X GET "$API/admin/payments?gateway=moneróo&limit=10" \
  -H "Content-Type: application/json" 2>&1)

echo "   Payment logs (dernières transactions):"
echo $LOGS | jq '.[0:3]' 2>/dev/null || echo $LOGS

echo ""
echo "=========================================="
echo "✅ Test Webhook Terminé!"
echo "=========================================="
