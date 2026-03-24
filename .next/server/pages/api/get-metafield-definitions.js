"use strict";(()=>{var e={};e.id=75,e.ids=[75],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6249:(e,r)=>{Object.defineProperty(r,"l",{enumerable:!0,get:function(){return function e(r,t){return t in r?r[t]:"then"in r&&"function"==typeof r.then?r.then(r=>e(r,t)):"function"==typeof r&&"default"===t?r:void 0}}})},344:(e,r,t)=>{t.r(r),t.d(r,{config:()=>l,default:()=>d,routeModule:()=>f});var n={};t.r(n),t.d(n,{default:()=>s});var a=t(1802),o=t(7153),i=t(6249);async function s(e,r){if("GET"!==e.method)return r.status(405).json({error:"Method not allowed"});let t=process.env.SHOPIFY_DOMAIN,n=process.env.SHOPIFY_ACCESS_TOKEN;if(!t||!n)return r.status(500).json({error:"Shopify credentials missing"});let a=`
    query {
      productMetafields: metafieldDefinitions(first: 250, ownerType: PRODUCT) {
        edges {
          node {
            namespace
            key
            type
            validations {
              name
              value
            }
          }
        }
      }
      variantMetafields: metafieldDefinitions(first: 250, ownerType: VARIANT) {
        edges {
          node {
            namespace
            key
            type
            validations {
              name
              value
            }
          }
        }
      }
    }
  `;try{let e=await fetch(`https://${t}/admin/api/2024-01/graphql.json`,{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":n},body:JSON.stringify({query:a})}),o=await e.json();if(o.errors)return console.error("GraphQL Errors:",o.errors),r.status(600).json({error:"Shopify GraphQL Error",details:o.errors});let i=o.data.productMetafields.edges.map(e=>e.node),s=o.data.variantMetafields.edges.map(e=>e.node),d=[...i,...s],l={};for(let e of d){let r=e.validations?.find(e=>"choices"===e.name);if(r&&r.value)try{let t=JSON.parse(r.value);Array.isArray(t)&&(l[e.key]=t)}catch(r){console.error("Failed to parse choices for",e.key)}"boolean"===e.type&&(l[e.key]="boolean")}r.status(200).json({success:!0,optionsDict:l})}catch(e){console.error("API Error:",e),r.status(500).json({error:"Internal Server Error",message:e.message})}}let d=(0,i.l)(n,"default"),l=(0,i.l)(n,"config"),f=new a.PagesAPIRouteModule({definition:{kind:o.x.PAGES_API,page:"/api/get-metafield-definitions",pathname:"/api/get-metafield-definitions",bundlePath:"",filename:""},userland:n})},7153:(e,r)=>{var t;Object.defineProperty(r,"x",{enumerable:!0,get:function(){return t}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(t||(t={}))},1802:(e,r,t)=>{e.exports=t(145)}};var r=require("../../webpack-api-runtime.js");r.C(e);var t=r(r.s=344);module.exports=t})();