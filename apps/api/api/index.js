// Entry-point de la funcion serverless de Vercel.
// Importa el handler YA COMPILADO por `nest build` (tsc), que conserva la
// metadata de decoradores que NestJS necesita para su inyeccion de dependencias.
// (Si Vercel compilara el .ts con esbuild se perderia esa metadata y romperia DI.)
module.exports = require('../dist/src/vercel').default;
