import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const hospitalesMock = [
  {
    nombre: 'Hosp. Dr. Cosme Argerich', //[cite: 18]
    direccion: 'La Boca, CABA', //[cite: 18]
    lat: -34.627667, //[cite: 18]
    lon: -58.365942, //[cite: 18]
    imagen: 'https://corebio.org.ar/wp-content/uploads/2018/09/argerich.jpg'
  },
  {
    nombre: 'Hospital General de Agudos Fernández', //[cite: 19]
    direccion: 'Av. Cervino 3356, CABA', //[cite: 19]
    lat: -34.581016, //[cite: 19]
    lon: -58.406809, //[cite: 19]
    imagen: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/Hospital_fernandez_buenosaires.jpg?utm_source=es.wikipedia.org&utm_campaign=index&utm_content=original'
  },
  {
    nombre: 'Hospital de Clínicas José de San Martín', //[cite: 20]
    direccion: 'Av. Córdoba 2351, CABA', //[cite: 20]
    lat: -34.598134, //[cite: 20]
    lon: -58.399971, //[cite: 20]
    imagen: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Hospital_de_Cl%C3%ADnicas_de_Buenos_Aires_%28Av._C%C3%B3rdoba%29.JPG?utm_source=es.wikipedia.org&utm_campaign=index&utm_content=original'
  }
];

const formatearEmail = (nombre: string) => {
  // Limpia el nombre quitando acentos, puntos y espacios para armar un mail limpio
  const nombreLimpio = nombre
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]/g, '');
  
  return `admin@${nombreLimpio}.com`;
};

async function main() {
  console.log('Iniciando carga de datos (Seeding)...');

  for (const hosp of hospitalesMock) {
    const emailAdmin = formatearEmail(hosp.nombre);

    const nuevoHospital = await prisma.hospital.create({
      data: {
        nombre: hosp.nombre,
        direccion: hosp.direccion,
        lat: hosp.lat,
        lon: hosp.lon,
        imagen: hosp.imagen,
        usuarios: {
          create: {
            nombre: `Admin ${hosp.nombre}`,
            email: emailAdmin,
            password: 'password123', // Contraseña temporal
            rol: 'Admin',
            activo: true,
          }
        }
      }
    });

    console.log(`✅ Creado: ${nuevoHospital.nombre} | Admin: ${emailAdmin}`);
  }

  console.log('¡Seeding completado con éxito!');
}

main()
  .catch((e) => {
    console.error(e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });