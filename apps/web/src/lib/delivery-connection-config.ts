import type { DeliveryProvider } from '@/lib/delivery';

export type ConnectionFieldType = 'text' | 'password' | 'number' | 'select' | 'checkbox';

export type ConnectionField = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  type?: ConnectionFieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  /** root = columna Prisma; config = JSON config; credentials = cifrado */
  storage: 'root' | 'config' | 'credentials';
};

export type DeliveryConnectionSchema = {
  title: string;
  lead: string;
  docsHint: string;
  webhookHeader: string;
  identityFields: ConnectionField[];
  configFields: ConnectionField[];
  credentialFields: ConnectionField[];
};

const COUNTRY_OPTIONS = [
  { value: 'AR', label: 'Argentina' },
  { value: 'UY', label: 'Uruguay' },
  { value: 'CL', label: 'Chile' },
  { value: 'CO', label: 'Colombia' },
  { value: 'MX', label: 'México' },
  { value: 'PE', label: 'Perú' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'BR', label: 'Brasil' },
];

const ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox / pruebas' },
  { value: 'production', label: 'Producción' },
];

export const DELIVERY_CONNECTION_SCHEMA: Record<DeliveryProvider, DeliveryConnectionSchema> = {
  rappi: {
    title: 'Conexión Rappi Partner API',
    lead: 'Credenciales de desarrollador Rappi y el ID de tu local. No uses campos de PedidosYa acá.',
    docsHint: 'En el portal de partners de Rappi: Store ID, Client ID y Client Secret. El webhook recibe pedidos nuevos y cambios de estado.',
    webhookHeader: 'X-Webhook-Secret',
    identityFields: [
      {
        key: 'storeExternalId',
        label: 'Store ID (Rappi)',
        placeholder: 'Ej. 123456',
        help: 'ID del local en Rappi. Lo ves en Rappi Partners → tu tienda.',
        required: true,
        storage: 'root',
      },
      {
        key: 'countryCode',
        label: 'País',
        type: 'select',
        options: COUNTRY_OPTIONS,
        required: true,
        storage: 'root',
      },
    ],
    configFields: [
      {
        key: 'brandId',
        label: 'Brand ID (opcional)',
        placeholder: 'Si Rappi te asignó un brand',
        help: 'Solo si tu cuenta partner lo requiere.',
        storage: 'config',
      },
      {
        key: 'restaurantId',
        label: 'Restaurant ID (opcional)',
        placeholder: 'ID interno del restaurante en Rappi',
        storage: 'config',
      },
      {
        key: 'environment',
        label: 'Ambiente API',
        type: 'select',
        options: ENV_OPTIONS,
        storage: 'config',
      },
      {
        key: 'apiBaseUrl',
        label: 'URL base API (avanzado)',
        placeholder: 'https://api.rappi.com.ar',
        help: 'Dejá vacío para usar el endpoint oficial del país.',
        storage: 'config',
      },
    ],
    credentialFields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'OAuth Client ID de Rappi Developers',
        required: true,
        storage: 'credentials',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        placeholder: 'OAuth Client Secret',
        required: true,
        storage: 'credentials',
      },
      {
        key: 'accessToken',
        label: 'Access Token (opcional)',
        type: 'password',
        placeholder: 'Si ya tenés un token de larga duración',
        help: 'Solo si Rappi te entregó un bearer token fijo además del OAuth.',
        storage: 'credentials',
      },
    ],
  },
  pedidosya: {
    title: 'Conexión PedidosYa Partner API',
    lead: 'Chain ID, Restaurant ID y credenciales del portal de partners. Campos propios de PedidosYa.',
    docsHint: 'En PedidosYa Partners: Chain ID de la cadena, Restaurant/Vendor ID del local y API Key o usuario/contraseña.',
    webhookHeader: 'X-Webhook-Secret',
    identityFields: [
      {
        key: 'chainExternalId',
        label: 'Chain ID',
        placeholder: 'Ej. chain-abc123',
        help: 'ID de cadena o marca en PedidosYa Partners.',
        required: true,
        storage: 'root',
      },
      {
        key: 'storeExternalId',
        label: 'Restaurant / Vendor ID',
        placeholder: 'Ej. vendor-789',
        help: 'ID del local o restaurante dentro de la cadena.',
        required: true,
        storage: 'root',
      },
      {
        key: 'countryCode',
        label: 'País',
        type: 'select',
        options: COUNTRY_OPTIONS,
        required: true,
        storage: 'root',
      },
    ],
    configFields: [
      {
        key: 'platformRestaurantName',
        label: 'Nombre del local en PedidosYa',
        placeholder: 'Como figura en el panel partner',
        storage: 'config',
      },
      {
        key: 'platformRestaurantId',
        label: 'Platform Restaurant ID (opcional)',
        placeholder: 'ID adicional si PedidosYa lo muestra aparte',
        storage: 'config',
      },
      {
        key: 'environment',
        label: 'Ambiente API',
        type: 'select',
        options: [
          { value: 'staging', label: 'Staging / pruebas' },
          { value: 'production', label: 'Producción' },
        ],
        storage: 'config',
      },
      {
        key: 'apiBaseUrl',
        label: 'URL base API (avanzado)',
        placeholder: 'https://partners-api.pedidosya.com',
        storage: 'config',
      },
    ],
    credentialFields: [
      {
        key: 'clientId',
        label: 'Client ID / Usuario API',
        placeholder: 'Usuario o client_id del partner',
        storage: 'credentials',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret / Contraseña API',
        type: 'password',
        storage: 'credentials',
      },
      {
        key: 'apiKey',
        label: 'API Key / Partner Token',
        type: 'password',
        placeholder: 'Token o API key del portal PedidosYa',
        help: 'Completá API Key o usuario/contraseña, según lo que te haya dado PedidosYa.',
        storage: 'credentials',
      },
    ],
  },
};

export function buildConnectionFormDefaults(provider: DeliveryProvider) {
  const schema = DELIVERY_CONNECTION_SCHEMA[provider];
  const root: Record<string, string | number | boolean> = {
    enabled: false,
    countryCode: 'AR',
    prepMinutesDefault: 15,
    autoAccept: false,
    autoConfirmSale: true,
    storeExternalId: '',
    chainExternalId: '',
  };
  const config: Record<string, string> = {};
  const credentials: Record<string, string> = {};

  for (const field of [...schema.identityFields, ...schema.configFields, ...schema.credentialFields]) {
    if (field.storage === 'config') config[field.key] = field.type === 'select' ? field.options?.[0]?.value ?? '' : '';
    if (field.storage === 'credentials') credentials[field.key] = '';
  }

  if (provider === 'rappi') {
    config.environment = 'sandbox';
  } else {
    config.environment = 'staging';
  }

  return { root, config, credentials };
}
