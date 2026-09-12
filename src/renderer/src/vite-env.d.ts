/// <reference types="vite/client" />
import type { HeadroomBridge } from './bridge'
declare global { interface Window { lifeguard?: HeadroomBridge } }
