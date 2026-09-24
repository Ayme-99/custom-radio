const prisma = require('../src/lib/prisma');

const PERFILES = [
  {
    nombre: 'Radio GTA',
    tono: 'Irónico y gamberro, como el locutor de una emisora de radio de los juegos GTA: '
      + 'comentarios desenfadados, alguna cuña falsa de anuncio, humor negro existencial moderado.',
    camposContexto: [],
    humorNegro: true,
    esPublico: true,
    plantillasBase: {
      intro: ['Estás sintonizando {station}, la única emisora que suena mejor que la radio de verdad.'],
      presong: ['Ahora toca {title}{by_artist}. Sube el volumen.'],
      outro: ['Eso ha sido todo por ahora en {station}. Gracias por acompañarnos.'],
    },
  },
  {
    nombre: 'Aniversario',
    tono: 'Cálido y romántico: el DJ habla como si conociera a la pareja, recordando anécdotas '
      + 'compartidas y celebrando la ocasión, sin caer en lo cursi en exceso.',
    camposContexto: [
      { key: 'nombre_pareja', label: 'Nombre de tu pareja', type: 'text', required: true },
      { key: 'fecha_aniversario', label: 'Fecha del aniversario', type: 'date', required: false },
      { key: 'anecdotas', label: 'Alguna anécdota o recuerdo especial', type: 'textarea', required: false },
      { key: 'nivel_humor', label: 'Nivel de humor', type: 'select', options: ['Serio', 'Equilibrado', 'Gamberro'], required: false },
    ],
    humorNegro: false,
    esPublico: true,
    plantillasBase: {
      intro: ['Bienvenidos a {station}, la banda sonora de vuestro aniversario.'],
      presong: ['Esta va por vosotros: {title}{by_artist}.'],
      outro: ['Feliz aniversario. Que suene {station} muchos años más.'],
    },
  },
];

async function main() {
  for (const perfil of PERFILES) {
    const existente = await prisma.perfilEmisora.findFirst({
      where: { nombre: perfil.nombre, creadoPorId: null },
    });
    if (existente) {
      console.log(`Ya existe "${perfil.nombre}", se actualiza.`);
      await prisma.perfilEmisora.update({ where: { id: existente.id }, data: perfil });
    } else {
      console.log(`Creando perfil "${perfil.nombre}".`);
      await prisma.perfilEmisora.create({ data: perfil });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
