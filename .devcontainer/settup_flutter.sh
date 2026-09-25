#!/usr/bin/env bash
# Instala el SDK de Flutter (canal stable) dentro del Codespace y lo deja
# listo para compilar a web. Se ejecuta solo, una vez, al crear el Codespace
# (postCreateCommand en devcontainer.json).
set -e

echo "Instalando dependencias del sistema para Flutter..."
sudo apt-get update -y
sudo apt-get install -y curl git unzip xz-utils zip libglu1-mesa ca-certificates

if [ ! -d "$HOME/flutter" ]; then
  echo "Clonando Flutter (canal stable)..."
  git clone https://github.com/flutter/flutter.git -b stable "$HOME/flutter" --depth 1
fi

# Añade Flutter al PATH de forma persistente para cualquier terminal nueva
if ! grep -q 'flutter/bin' "$HOME/.bashrc" 2>/dev/null; then
  echo 'export PATH="$PATH:$HOME/flutter/bin"' >> "$HOME/.bashrc"
fi
export PATH="$PATH:$HOME/flutter/bin"

flutter config --enable-web --no-analytics
flutter precache --web
flutter doctor || true

echo ""
echo "Listo. Flutter instalado en $HOME/flutter."
echo "Para ver el frontend en el navegador:"
echo "  1) cd a la carpeta de tu proyecto Flutter (donde está pubspec.yaml)"
echo "  2) flutter pub get"
echo "  3) flutter run -d web-server --web-hostname=0.0.0.0 --web-port=5173"
echo "  4) Abre la pestaña 'Ports' en Codespaces y haz clic en el puerto 5173"