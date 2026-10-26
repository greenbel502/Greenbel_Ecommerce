import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isBrandLogoPath,brandLogoUrl,suggestBrandSlug} from '../src/lib/brand-logo.ts';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const file='33333333-3333-4333-8333-333333333333.webp';
test('un logotipo solo puede apuntar a una imagen WebP de su propia marca',()=>{
 assert.equal(isBrandLogoPath(owner,`${owner}/${file}`),true);
 for(const path of [`${other}/${file}`,`../${owner}/${file}`,`${owner}/../${file}`,`https://example.invalid/${file}`,`${owner}/${file}.svg`,`${owner}/${file}?token=abc`,null,''])assert.equal(isBrandLogoPath(owner,path),false);
 assert.equal(isBrandLogoPath('-'.repeat(36),`${'-'.repeat(36)}/${file}`),false);
});
test('las URLs públicas y de vista previa usan rutas controladas y versión de imagen',()=>{
 assert.equal(brandLogoUrl(owner,`${owner}/${file}`),`/api/brand-logos/${owner}?v=${file}`);
 assert.equal(brandLogoUrl(owner,`${owner}/${file}`,true),`/api/admin/brand-logos/${owner}?v=${file}`);
 assert.equal(brandLogoUrl(owner,`${other}/${file}`),null);
});
test('el identificador sugerido conserva nombres legibles sin espacios ni delimitadores',()=>{
 assert.equal(suggestBrandSlug('  Agrícola & Riego, S.A.  '),'agricola-riego-s-a');
 assert.equal(suggestBrandSlug('KAWASHIMA PRO'),'kawashima-pro');
 assert.equal(suggestBrandSlug('---'),'');
 assert.ok(suggestBrandSlug('a'.repeat(300)).length<=160);
});
