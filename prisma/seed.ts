import { PrismaClient } from '@prisma/client';
import { hashearPassword } from '../src/utils/password';

const prisma = new PrismaClient();

const hospitalesMock = [
  {
    nombre: 'Hosp. Dr. Cosme Argerich',
    direccion: 'La Boca, CABA',
    lat: -34.627667,
    lon: -58.365942,
    imagen: 'https://corebio.org.ar/wp-content/uploads/2018/09/argerich.jpg'
  },
  {
    nombre: 'Hospital General de Agudos Fernández',
    direccion: 'Av. Cervino 3356, CABA',
    lat: -34.581016,
    lon: -58.406809,
    imagen: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/Hospital_fernandez_buenosaires.jpg?utm_source=es.wikipedia.org&utm_campaign=index&utm_content=original'
  },
  {
    nombre: 'Hospital de Clínicas José de San Martín',
    direccion: 'Av. Córdoba 2351, CABA',
    lat: -34.598134,
    lon: -58.399971,
    imagen: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Hospital_de_Cl%C3%ADnicas_de_Buenos_Aires_%28Av._C%C3%B3rdoba%29.JPG?utm_source=es.wikipedia.org&utm_campaign=index&utm_content=original'
  }
];

const formatearEmail = (nombre: string) => {
  const nombreLimpio = nombre
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]/g, '');
  
  return `admin@${nombreLimpio}.com`;
};

async function main() {
  console.log('Iniciando carga de datos (Seeding)...');

  const passwordAdmin = await hashearPassword('password123');

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
            password: passwordAdmin,
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