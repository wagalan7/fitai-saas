#!/bin/bash
set -e

echo "🚀 FitAI Setup"
echo "=============="

# Check Node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js não encontrado. Instale via: https://nodejs.org"
  exit 1
fi

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "⚠️  Docker não encontrado. Banco local não será iniciado."
  USE_DOCKER=false
else
  USE_DOCKER=true
fi

# Copy .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Arquivo .env criado — EDITE com suas chaves antes de continuar!"
  echo "   Especialmente: OPENAI_API_KEY e JWT_SECRET"
  exit 0
fi

# Install deps
echo "📦 Instalando dependências..."
npm install

# Start DB
if [ "$USE_DOCKER" = true ]; then
  echo "🐘 Iniciando PostgreSQL..."
  docker compose up -d db
  sleep 3
fi

# Prisma
echo "🗃️  Gerando Prisma Client e migrando banco..."
npm run db:generate
npm run db:push

echo ""
echo "✅ Setup completo!"
echo ""
echo "Para iniciar em desenvolvimento:"
echo "  npm run dev"
echo ""
echo "Para acessar o Prisma Studio:"
echo "  npm run db:studio"
