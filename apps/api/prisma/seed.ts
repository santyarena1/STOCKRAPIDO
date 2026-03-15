import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const CATALOGO_BASE = [
  { name: 'Coca Cola 500ml', barcode: '779000100001', cat: 'Bebidas', price: 800 },
  { name: 'Coca Cola 1.5L', barcode: '779000100002', cat: 'Bebidas', price: 1200 },
  { name: 'Sprite 500ml', barcode: '779000100003', cat: 'Bebidas', price: 750 },
  { name: 'Fanta 500ml', barcode: '779000100004', cat: 'Bebidas', price: 750 },
  { name: 'Agua Mineral 500ml', barcode: '779000200001', cat: 'Bebidas', price: 400 },
  { name: 'Agua Mineral 2L', barcode: '779000200002', cat: 'Bebidas', price: 600 },
  { name: 'Pepsi 500ml', barcode: '779000300001', cat: 'Bebidas', price: 750 },
  { name: 'Seven Up 500ml', barcode: '779000300002', cat: 'Bebidas', price: 750 },
  { name: 'Mirinda 500ml', barcode: '779000300003', cat: 'Bebidas', price: 750 },
  { name: 'Jugo Naranja 1L', barcode: '779000400001', cat: 'Bebidas', price: 900 },
  { name: 'Jugo Manzana 1L', barcode: '779000400002', cat: 'Bebidas', price: 900 },
  { name: 'Gatorade 500ml', barcode: '779000500001', cat: 'Bebidas', price: 850 },
  { name: 'Red Bull 250ml', barcode: '779000600001', cat: 'Bebidas', price: 1500 },
  { name: 'Monster 473ml', barcode: '779000600002', cat: 'Bebidas', price: 1200 },
  { name: 'Café con leche', barcode: '779000700001', cat: 'Bebidas', price: 500 },
  { name: 'Té Negro 500ml', barcode: '779000800001', cat: 'Bebidas', price: 450 },
  { name: 'Té Verde 500ml', barcode: '779000800002', cat: 'Bebidas', price: 450 },
  { name: 'Leche Entera 1L', barcode: '779000900001', cat: 'Lácteos', price: 700 },
  { name: 'Leche Descremada 1L', barcode: '779000900002', cat: 'Lácteos', price: 720 },
  { name: 'Yogur Frutilla 190g', barcode: '779001000001', cat: 'Lácteos', price: 450 },
  { name: 'Yogur Vainilla 190g', barcode: '779001000002', cat: 'Lácteos', price: 450 },
  { name: 'Dulce de leche 1kg', barcode: '779001100001', cat: 'Almacén', price: 1800 },
  { name: 'Mermelada 454g', barcode: '779001100002', cat: 'Almacén', price: 650 },
  { name: 'Manteca 200g', barcode: '779001100003', cat: 'Almacén', price: 550 },
  { name: 'Aceite 900ml', barcode: '779001200001', cat: 'Almacén', price: 1200 },
  { name: 'Vinagre 500ml', barcode: '779001200002', cat: 'Almacén', price: 400 },
  { name: 'Arroz 1kg', barcode: '779001300001', cat: 'Almacén', price: 800 },
  { name: 'Fideos 500g', barcode: '779001300002', cat: 'Almacén', price: 450 },
  { name: 'Polenta 500g', barcode: '779001300003', cat: 'Almacén', price: 350 },
  { name: 'Harina 1kg', barcode: '779001300004', cat: 'Almacén', price: 500 },
  { name: 'Azúcar 1kg', barcode: '779001300005', cat: 'Almacén', price: 700 },
  { name: 'Sal 500g', barcode: '779001300006', cat: 'Almacén', price: 250 },
  { name: 'Papas Fritas Lays', barcode: '779001400001', cat: 'Snacks', price: 850 },
  { name: 'Papas Fritas Pringles', barcode: '779001400002', cat: 'Snacks', price: 1200 },
  { name: 'Doritos', barcode: '779001400003', cat: 'Snacks', price: 900 },
  { name: 'Cheetos', barcode: '779001400004', cat: 'Snacks', price: 850 },
  { name: 'Papas Krachitos', barcode: '779001400005', cat: 'Snacks', price: 600 },
  { name: 'Maní 50g', barcode: '779001500001', cat: 'Snacks', price: 350 },
  { name: 'Palitos', barcode: '779001500002', cat: 'Snacks', price: 400 },
  { name: 'Chizitos', barcode: '779001500003', cat: 'Snacks', price: 500 },
  { name: 'Alfajor Jorgito', barcode: '779001600001', cat: 'Golosinas', price: 350 },
  { name: 'Alfajor Milka', barcode: '779001600002', cat: 'Golosinas', price: 450 },
  { name: 'Alfajor Guaymallén', barcode: '779001600003', cat: 'Golosinas', price: 300 },
  { name: 'Alfajor Tatin', barcode: '779001600004', cat: 'Golosinas', price: 400 },
  { name: 'Chocolate Milka', barcode: '779001700001', cat: 'Golosinas', price: 800 },
  { name: 'Chocolate Cofler', barcode: '779001700002', cat: 'Golosinas', price: 450 },
  { name: 'Chocolate Block', barcode: '779001700003', cat: 'Golosinas', price: 500 },
  { name: 'Caramelos Butters', barcode: '779001800001', cat: 'Golosinas', price: 200 },
  { name: 'Caramelos Arcor', barcode: '779001800002', cat: 'Golosinas', price: 150 },
  { name: 'Chupetín Pop', barcode: '779001800003', cat: 'Golosinas', price: 100 },
  { name: 'Gomitas Mogul', barcode: '779001800004', cat: 'Golosinas', price: 350 },
  { name: 'Turrón', barcode: '779001800005', cat: 'Golosinas', price: 250 },
  { name: 'Oreo', barcode: '779001900001', cat: 'Golosinas', price: 600 },
  { name: 'Pepitos', barcode: '779001900002', cat: 'Golosinas', price: 550 },
  { name: 'Sonrisas', barcode: '779001900003', cat: 'Golosinas', price: 400 },
  { name: 'Marlboro Rojo', barcode: '779002000001', cat: 'Cigarrillos', price: 2500 },
  { name: 'Marlboro Gold', barcode: '779002000002', cat: 'Cigarrillos', price: 2500 },
  { name: 'Phillip Morris', barcode: '779002000003', cat: 'Cigarrillos', price: 2400 },
  { name: 'Lucky Strike', barcode: '779002000004', cat: 'Cigarrillos', price: 2300 },
  { name: 'Benson', barcode: '779002000005', cat: 'Cigarrillos', price: 2200 },
  { name: 'Lavatodo 500ml', barcode: '779002100001', cat: 'Limpieza', price: 800 },
  { name: 'Detergente 500ml', barcode: '779002100002', cat: 'Limpieza', price: 600 },
  { name: 'Esponja', barcode: '779002100003', cat: 'Limpieza', price: 250 },
  { name: 'Papel Higiénico 4 rollos', barcode: '779002200001', cat: 'Limpieza', price: 1200 },
  { name: 'Pañuelos descartables', barcode: '779002200002', cat: 'Limpieza', price: 400 },
  { name: 'Jabón en polvo 1kg', barcode: '779002200003', cat: 'Limpieza', price: 1500 },
  { name: 'Enjuague bucal 500ml', barcode: '779002300001', cat: 'Higiene', price: 900 },
  { name: 'Pasta dental', barcode: '779002300002', cat: 'Higiene', price: 650 },
  { name: 'Jabón líquido 500ml', barcode: '779002300003', cat: 'Higiene', price: 500 },
  { name: 'Shampoo 400ml', barcode: '779002300004', cat: 'Higiene', price: 800 },
  { name: 'Desodorante', barcode: '779002300005', cat: 'Higiene', price: 700 },
  { name: 'Cerveza Lata 473ml', barcode: '779002400001', cat: 'Bebidas', price: 600 },
  { name: 'Cerveza Six Pack', barcode: '779002400002', cat: 'Bebidas', price: 3500 },
  { name: 'Vino Tinto 750ml', barcode: '779002500001', cat: 'Bebidas', price: 2500 },
  { name: 'Vino Blanco 750ml', barcode: '779002500002', cat: 'Bebidas', price: 2500 },
  { name: 'Fernet 750ml', barcode: '779002600001', cat: 'Bebidas', price: 4500 },
  { name: 'Gaseosa 2.25L', barcode: '779002700001', cat: 'Bebidas', price: 1100 },
  { name: 'Hielo 2kg', barcode: '779002800001', cat: 'Bebidas', price: 400 },
  { name: 'Pan lactal', barcode: '779002900001', cat: 'Panadería', price: 650 },
  { name: 'Pan integral', barcode: '779002900002', cat: 'Panadería', price: 700 },
  { name: 'Factura', barcode: '779003000001', cat: 'Panadería', price: 200 },
  { name: 'Medialuna', barcode: '779003000002', cat: 'Panadería', price: 150 },
  { name: 'Tostadas', barcode: '779003000003', cat: 'Panadería', price: 400 },
  { name: 'Galletitas Oreo', barcode: '779003100001', cat: 'Golosinas', price: 550 },
  { name: 'Galletitas Pepitos', barcode: '779003100002', cat: 'Golosinas', price: 500 },
  { name: 'Galletitas Diversión', barcode: '779003100003', cat: 'Golosinas', price: 450 },
  { name: 'Galletitas Criollitas', barcode: '779003100004', cat: 'Golosinas', price: 400 },
  { name: 'Bizcochuelo', barcode: '779003200001', cat: 'Panadería', price: 800 },
  { name: 'Budín', barcode: '779003200002', cat: 'Panadería', price: 600 },
  { name: 'Mantecol', barcode: '779003300001', cat: 'Golosinas', price: 500 },
  { name: 'Bocadito', barcode: '779003300002', cat: 'Golosinas', price: 350 },
  { name: 'Rocklets', barcode: '779003300003', cat: 'Golosinas', price: 400 },
  { name: 'Mentitas', barcode: '779003400001', cat: 'Golosinas', price: 300 },
  { name: 'Tic Tac', barcode: '779003400002', cat: 'Golosinas', price: 350 },
  { name: 'Halls', barcode: '779003400003', cat: 'Golosinas', price: 250 },
  { name: 'Vick Vaporub', barcode: '779003500001', cat: 'Farmacia', price: 1200 },
  { name: 'Aspirina', barcode: '779003500002', cat: 'Farmacia', price: 800 },
  { name: 'Paracetamol', barcode: '779003500003', cat: 'Farmacia', price: 600 },
  { name: 'Ibuprofeno', barcode: '779003500004', cat: 'Farmacia', price: 700 },
  { name: 'Curitas', barcode: '779003500005', cat: 'Farmacia', price: 500 },
  { name: 'Alcohol 500ml', barcode: '779003600001', cat: 'Farmacia', price: 400 },
  { name: 'Agua oxigenada', barcode: '779003600002', cat: 'Farmacia', price: 350 },
  { name: 'Repelente', barcode: '779003600003', cat: 'Farmacia', price: 900 },
  { name: 'Protector solar', barcode: '779003600004', cat: 'Farmacia', price: 1500 },
  { name: 'Energizante Speed', barcode: '779003700001', cat: 'Bebidas', price: 800 },
  { name: 'Cable USB', barcode: '779003800001', cat: 'Otros', price: 1500 },
  { name: 'Pila AA', barcode: '779003800002', cat: 'Otros', price: 400 },
  { name: 'Fósforos', barcode: '779003800003', cat: 'Otros', price: 150 },
  { name: 'Encendedor', barcode: '779003800004', cat: 'Otros', price: 300 },
  { name: 'Bolsa chica', barcode: '779003900001', cat: 'Otros', price: 50 },
  { name: 'Bolsa grande', barcode: '779003900002', cat: 'Otros', price: 80 },
];

async function main() {
  const email = process.env.SEED_TEST_EMAIL || 'owner@demo.com';
  const password = process.env.SEED_TEST_PASSWORD || 'Demo123!';

  let business = await prisma.business.findFirst();
  let owner = await prisma.user.findFirst({ where: { email } });

  if (!business) {
    const hash = await argon2.hash(password, { type: 2 });
    business = await prisma.business.create({
      data: {
        name: 'Kiosco Demo',
        cuit: '20-12345678-9',
        address: 'Av. Demo 123',
        currency: 'ARS',
      },
    });
    owner = await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        name: 'Owner Demo',
        role: 'OWNER',
        businessId: business.id,
      },
    });
    await prisma.user.create({
      data: {
        email: 'cajero@demo.com',
        passwordHash: await argon2.hash('Demo123!', { type: 2 }),
        name: 'Cajero Demo',
        role: 'CAJERO',
        businessId: business.id,
      },
    });
    console.log('Negocio y usuarios creados.');
  }

  const count = await prisma.product.count({ where: { businessId: business!.id } });
  if (count < 50) {
    const catMap = new Map<string, string>();
    const cats = ['Bebidas', 'Snacks', 'Golosinas', 'Almacén', 'Lácteos', 'Limpieza', 'Higiene', 'Cigarrillos', 'Panadería', 'Farmacia', 'Otros'];
    for (const c of cats) {
      const cat = await prisma.category.findFirst({ where: { businessId: business!.id, name: c } })
        ?? await prisma.category.create({ data: { name: c, businessId: business!.id } });
      catMap.set(c, cat.id);
    }
    for (const p of CATALOGO_BASE) {
      const catId = catMap.get(p.cat) ?? null;
      const exists = await prisma.product.findFirst({
        where: { businessId: business!.id, barcode: p.barcode },
      });
      if (!exists) {
        await prisma.product.create({
          data: {
            businessId: business!.id,
            name: p.name,
            barcode: p.barcode,
            categoryId: catId,
            price: p.price,
            stock: 50,
            minStock: 5,
            stockControl: true,
          },
        });
      }
    }
    console.log('Catálogo base cargado:', CATALOGO_BASE.length, 'productos');
  }

  console.log('Seed OK. Usuario:', email, 'Password:', password);
  console.log('Cajero: cajero@demo.com / Demo123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
