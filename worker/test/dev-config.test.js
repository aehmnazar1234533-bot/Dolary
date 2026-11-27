import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeDolaryConfig,configToJs,DEFAULT_DOLARY_CONFIG} from "../src/dev-config.js";
test("defaults are complete",()=>{const c=sanitizeDolaryConfig({});assert.equal(c.version,1);assert.equal(c.branding.appName,"دولاري");assert.equal(c.features.calculator,true)});
test("unsafe links are removed",()=>{const c=sanitizeDolaryConfig({links:[{url:"javascript:alert(1)",label:"x"},{url:"https://example.com",label:"ok"}]});assert.equal(c.links.length,1);assert.equal(c.links[0].url,"https://example.com/")});
test("layout values are bounded",()=>{const c=sanitizeDolaryConfig({theme:{radius:999,spacing:-2}});assert.equal(c.theme.radius,40);assert.equal(c.theme.spacing,8)});
test("config output is plain data",()=>{const s=configToJs(DEFAULT_DOLARY_CONFIG);assert.match(s,/window\.DOLARY_CONFIG=/);assert.doesNotMatch(s,/<script/i)});