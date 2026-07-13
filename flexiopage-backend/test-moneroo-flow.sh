#!/bin/bash

# Test complet du flux de paiement Moneroo

API="http://localhost:5051/api"
STORE_SLUG="test-store"
PRODUCT_SLUG="test-product"
EMAIL="test@example.com"
CUSTOMER_NAME="Test Customer"
PHONE="+221771234567"
COUNTRY="SN"

echo "=========================================="
echo "🧪 Test Flux Moneroo Complet"
echo "=========================================="
echo ""

# Étape 1: Créer une boutique de test
echo "1️⃣ Créer une boutique de test..."
STORE_RESPONSE=$(curl -s -X POST "$API/public/stores" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Store",
    "slug": "'$STORE_SLUG'",
    "storeType": "physical",
    "currency": "XOF"
  }')

STORE_ID=$(echo $STORE_RESPONSE | grep -o '"_id":"[^"]*' | cut -d'"' -f4)
echo "   ✅ Boutique créée: $STORE_ID"
echo ""

# Étape 2: Créer un produit
echo "2️⃣ Créer un produit de test..."
PRODUCT_RESPONSE=$(curl -s -X POST "$API/public/products" \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "'$STORE_ID'",
    "name": "Test Product",
    "slug": "'$PRODUCT_SLUG'",
    "price": 500,
    "currency": "XOF",
    "isPublished": true
  }')

PRODUCT_ID=$(echo $PRODUCT_RESPONSE | grep -o '"_id":"[^"]*' | cut -d'"' -f4)
echo "   ✅ Produit créé: $PRODUCT_ID (500 XOF)"
echo ""

# Étape 3: Initier un paiement Moneroo
echo "3️⃣ Initier un paiement avec Moneroo..."
INITIATE_RESPONSE=$(curl -s -X POST "$API/payment/initiate" \
  -H "Content-Type: application/json" \
  -d '{
    "storeSlug": "'$STORE_SLUG'",
    "productSlug": "'$PRODUCT_SLUG'",
    "quantity": 1,
    "email": "'$EMAIL'",
    "customerName": "'$CUSTOMER_NAME'",
    "phone": "'$PHONE'",
    "country": "'$COUNTRY'",
    "gateway": "moneróo",
    "method": "mobile_money"
  }')

echo "   Réponse initiate:"
echo $INITIATE_RESPONSE | grep -o '"[^"]*":"[^"]*' | head -10
echo ""

TRANSACTION_REF=$(echo $INITIATE_RESPONSE | grep -o '"transactionRef":"[^"]*' | cut -d'"' -f4)
ORDER_ID=$(echo $INITIATE_RESPONSE | grep -o '"orderId":"[^"]*' | cut -d'"' -f4)

if [ -z "$TRANSACTION_REF" ] || [ -z "$ORDER_ID" ]; then
  echo "   ❌ Erreur: Impossible de récupérer transactionRef ou orderId"
  echo "   Réponse complète:"
  echo $INITIATE_RESPONSE | jq '.'
  exit 1
fi

echo "   ✅ Paiement initié"
echo "   - Transaction Ref: $TRANSACTION_REF"
echo "   - Order ID: $ORDER_ID"
echo ""

# Étape 4: Vérifier le statut avant webhook
echo "4️⃣ Vérifier le statut AVANT webhook..."
VERIFY_BEFORE=$(curl -s -X GET "$API/payment/verify/$TRANSACTION_REF" \
  -H "Content-Type: application/json")

echo "   Statut avant:"
echo $VERIFY_BEFORE | jq '.status'
echo ""

# Étape 5: Simuler un webhook Moneroo (paiement réussi)
echo "5️⃣ Simuler webhook Moneroo (success)..."
WEBHOOK_RESPONSE=$(curl -s -X POST "http://localhost:5051/api/webhooks/moneróo" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "'$TRANSACTION_REF'",
    "payment_id": "'$TRANSACTION_REF'",
    "status": "success",
    "amount": 500,
    "currency": "XOF",
    "customer": {
      "email": "'$EMAIL'",
      "phone": "'$PHONE'"
    },
    "metadata": {
      "order_id": "'$ORDER_ID'",
      "order_number": "001"
    },
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }')

echo "   Webhook response: $WEBHOOK_RESPONSE"
echo ""

# Étape 6: Vérifier le statut après webhook
echo "6️⃣ Vérifier le statut APRÈS webhook..."
sleep 1  # Attendre le traitement du webhook
VERIFY_AFTER=$(curl -s -X GET "$API/payment/verify/$TRANSACTION_REF" \
  -H "Content-Type: application/json")

echo "   Statut après:"
echo $VERIFY_AFTER | jq '.'
echo ""

# Étape 7: Vérifier via endpoint admin
echo "7️⃣ Vérifier via endpoint admin..."
ADMIN_VERIFY=$(curl -s -X GET "$API/admin/payments/$TRANSACTION_REF/verify" \
  -H "Content-Type: application/json")

echo "   Admin verify response:"
echo $ADMIN_VERIFY | jq '.'
echo ""

# Étape 8: Lister les transactions
echo "8️⃣ Lister les transactions Moneroo..."
TRANSACTIONS=$(curl -s -X GET "$API/admin/payments?gateway=moneróo&limit=5" \
  -H "Content-Type: application/json")

echo "   Transactions Moneroo:"
echo $TRANSACTIONS | jq '.[0]'
echo ""

echo "=========================================="
echo "✅ Test Complet Terminé!"
echo "=========================================="
echo ""
echo "Summary:"
echo "- Store ID: $STORE_ID"
echo "- Order ID: $ORDER_ID"
echo "- Transaction Ref: $TRANSACTION_REF"
echo ""
