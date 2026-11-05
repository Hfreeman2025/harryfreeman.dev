/** True in the hosted build (`VITE_HOSTED=1`), the public site, where Harry's local tools cannot be opened. */
export const HOSTED = import.meta.env.VITE_HOSTED === '1';
