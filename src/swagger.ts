import openapiSpec from './openapi.json';
import { version } from '../package.json';

// Update version dynamically from package.json
export const swaggerSpec = {
  ...openapiSpec,
  info: {
    ...openapiSpec.info,
    version,
  },
};
