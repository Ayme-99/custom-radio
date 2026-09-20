/*
  Warnings:

  - Added the required column `passwordHash` to the `Usuario` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MotorVoz" AS ENUM ('EDGE', 'OPENAI', 'ELEVENLABS');

-- CreateEnum
CREATE TYPE "EstadoProyecto" AS ENUM ('BORRADOR', 'GUION_GENERADO', 'AUDIO_GENERADO', 'EXPIRADO');

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "apiKeyEleven" TEXT,
ADD COLUMN     "apiKeyOpenAI" TEXT,
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PerfilEmisora" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tono" TEXT NOT NULL,
    "camposContexto" JSONB NOT NULL,
    "humorNegro" BOOLEAN NOT NULL DEFAULT false,
    "plantillasBase" JSONB,
    "esPublico" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerfilEmisora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proyecto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "contexto" JSONB NOT NULL,
    "motorVoz" "MotorVoz" NOT NULL DEFAULT 'EDGE',
    "vozNombre" TEXT,
    "vozRate" TEXT,
    "vozPitch" TEXT,
    "estado" "EstadoProyecto" NOT NULL DEFAULT 'BORRADOR',
    "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pista" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "artista" TEXT,
    "orden" INTEGER NOT NULL,
    "duracionMs" INTEGER,

    CONSTRAINT "Pista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineaGuion" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "precedeA" TEXT,

    CONSTRAINT "LineaGuion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PerfilEmisora" ADD CONSTRAINT "PerfilEmisora_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "PerfilEmisora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pista" ADD CONSTRAINT "Pista_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaGuion" ADD CONSTRAINT "LineaGuion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
