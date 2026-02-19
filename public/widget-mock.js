"use strict";var MedicalCalculatorWidget=(()=>{var We=Object.create;var le=Object.defineProperty;var je=Object.getOwnPropertyDescriptor;var Be=Object.getOwnPropertyNames;var Je=Object.getPrototypeOf,Ve=Object.prototype.hasOwnProperty;var ce=(t,e)=>()=>(e||t((e={exports:{}}).exports,e),e.exports);var Ge=(t,e,o,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of Be(e))!Ve.call(t,a)&&a!==o&&le(t,a,{get:()=>e[a],enumerable:!(r=je(e,a))||r.enumerable});return t};var L=(t,e,o)=>(o=t!=null?We(Je(t)):{},Ge(e||!t||!t.__esModule?le(o,"default",{value:t,enumerable:!0}):o,t));var Le=ce(Y=>{"use strict";var _t=Symbol.for("react.transitional.element"),st=Symbol.for("react.fragment");function $e(t,e,o){var r=null;if(o!==void 0&&(r=""+o),e.key!==void 0&&(r=""+e.key),"key"in e){o={};for(var a in e)a!=="key"&&(o[a]=e[a])}else o=e;return e=o.ref,{$$typeof:_t,type:t,key:r,ref:e!==void 0?e:null,props:o}}Y.Fragment=st;Y.jsx=$e;Y.jsxs=$e});var I=ce((mt,Oe)=>{"use strict";Oe.exports=Le()});var j,w,he,Ye,U,ue,me,ve,we,te,Z,K,Qe,M={},be=[],Xe=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,B=Array.isArray;function z(t,e){for(var o in e)t[o]=e[o];return t}function oe(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function Ze(t,e,o){var r,a,i,_={};for(i in e)i=="key"?r=e[i]:i=="ref"?a=e[i]:_[i]=e[i];if(arguments.length>2&&(_.children=arguments.length>3?j.call(arguments,2):o),typeof t=="function"&&t.defaultProps!=null)for(i in t.defaultProps)_[i]===void 0&&(_[i]=t.defaultProps[i]);return R(t,_,r,a,null)}function R(t,e,o,r,a){var i={type:t,props:e,key:o,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:a??++he,__i:-1,__u:0};return a==null&&w.vnode!=null&&w.vnode(i),i}function J(t){return t.children}function q(t,e){this.props=t,this.context=e}function F(t,e){if(e==null)return t.__?F(t.__,t.__i+1):null;for(var o;e<t.__k.length;e++)if((o=t.__k[e])!=null&&o.__e!=null)return o.__e;return typeof t.type=="function"?F(t):null}function ye(t){var e,o;if((t=t.__)!=null&&t.__c!=null){for(t.__e=t.__c.base=null,e=0;e<t.__k.length;e++)if((o=t.__k[e])!=null&&o.__e!=null){t.__e=t.__c.base=o.__e;break}return ye(t)}}function pe(t){(!t.__d&&(t.__d=!0)&&U.push(t)&&!W.__r++||ue!=w.debounceRendering)&&((ue=w.debounceRendering)||me)(W)}function W(){for(var t,e,o,r,a,i,_,d=1;U.length;)U.length>d&&U.sort(ve),t=U.shift(),d=U.length,t.__d&&(o=void 0,r=void 0,a=(r=(e=t).__v).__e,i=[],_=[],e.__P&&((o=z({},r)).__v=r.__v+1,w.vnode&&w.vnode(o),re(e.__P,o,r,e.__n,e.__P.namespaceURI,32&r.__u?[a]:null,i,a??F(r),!!(32&r.__u),_),o.__v=r.__v,o.__.__k[o.__i]=o,Se(i,o,_),r.__e=r.__=null,o.__e!=a&&ye(o)));W.__r=0}function xe(t,e,o,r,a,i,_,d,f,s,c){var n,g,l,y,E,S,p,v=r&&r.__k||be,P=e.length;for(f=Ke(o,e,v,f,P),n=0;n<P;n++)(l=o.__k[n])!=null&&(g=l.__i==-1?M:v[l.__i]||M,l.__i=n,S=re(t,l,g,a,i,_,d,f,s,c),y=l.__e,l.ref&&g.ref!=l.ref&&(g.ref&&ne(g.ref,null,l),c.push(l.ref,l.__c||y,l)),E==null&&y!=null&&(E=y),(p=!!(4&l.__u))||g.__k===l.__k?f=ke(l,f,t,p):typeof l.type=="function"&&S!==void 0?f=S:y&&(f=y.nextSibling),l.__u&=-7);return o.__e=E,f}function Ke(t,e,o,r,a){var i,_,d,f,s,c=o.length,n=c,g=0;for(t.__k=new Array(a),i=0;i<a;i++)(_=e[i])!=null&&typeof _!="boolean"&&typeof _!="function"?(typeof _=="string"||typeof _=="number"||typeof _=="bigint"||_.constructor==String?_=t.__k[i]=R(null,_,null,null,null):B(_)?_=t.__k[i]=R(J,{children:_},null,null,null):_.constructor===void 0&&_.__b>0?_=t.__k[i]=R(_.type,_.props,_.key,_.ref?_.ref:null,_.__v):t.__k[i]=_,f=i+g,_.__=t,_.__b=t.__b+1,d=null,(s=_.__i=et(_,o,f,n))!=-1&&(n--,(d=o[s])&&(d.__u|=2)),d==null||d.__v==null?(s==-1&&(a>c?g--:a<c&&g++),typeof _.type!="function"&&(_.__u|=4)):s!=f&&(s==f-1?g--:s==f+1?g++:(s>f?g--:g++,_.__u|=4))):t.__k[i]=null;if(n)for(i=0;i<c;i++)(d=o[i])!=null&&(2&d.__u)==0&&(d.__e==r&&(r=F(d)),Ce(d,d));return r}function ke(t,e,o,r){var a,i;if(typeof t.type=="function"){for(a=t.__k,i=0;a&&i<a.length;i++)a[i]&&(a[i].__=t,e=ke(a[i],e,o,r));return e}t.__e!=e&&(r&&(e&&t.type&&!e.parentNode&&(e=F(t)),o.insertBefore(t.__e,e||null)),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType==8);return e}function et(t,e,o,r){var a,i,_,d=t.key,f=t.type,s=e[o],c=s!=null&&(2&s.__u)==0;if(s===null&&d==null||c&&d==s.key&&f==s.type)return o;if(r>(c?1:0)){for(a=o-1,i=o+1;a>=0||i<e.length;)if((s=e[_=a>=0?a--:i++])!=null&&(2&s.__u)==0&&d==s.key&&f==s.type)return _}return-1}function fe(t,e,o){e[0]=="-"?t.setProperty(e,o??""):t[e]=o==null?"":typeof o!="number"||Xe.test(e)?o:o+"px"}function O(t,e,o,r,a){var i,_;e:if(e=="style")if(typeof o=="string")t.style.cssText=o;else{if(typeof r=="string"&&(t.style.cssText=r=""),r)for(e in r)o&&e in o||fe(t.style,e,"");if(o)for(e in o)r&&o[e]==r[e]||fe(t.style,e,o[e])}else if(e[0]=="o"&&e[1]=="n")i=e!=(e=e.replace(we,"$1")),_=e.toLowerCase(),e=_ in t||e=="onFocusOut"||e=="onFocusIn"?_.slice(2):e.slice(2),t.l||(t.l={}),t.l[e+i]=o,o?r?o.u=r.u:(o.u=te,t.addEventListener(e,i?K:Z,i)):t.removeEventListener(e,i?K:Z,i);else{if(a=="http://www.w3.org/2000/svg")e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!="width"&&e!="height"&&e!="href"&&e!="list"&&e!="form"&&e!="tabIndex"&&e!="download"&&e!="rowSpan"&&e!="colSpan"&&e!="role"&&e!="popover"&&e in t)try{t[e]=o??"";break e}catch{}typeof o=="function"||(o==null||o===!1&&e[4]!="-"?t.removeAttribute(e):t.setAttribute(e,e=="popover"&&o==1?"":o))}}function ge(t){return function(e){if(this.l){var o=this.l[e.type+t];if(e.t==null)e.t=te++;else if(e.t<o.u)return;return o(w.event?w.event(e):e)}}}function re(t,e,o,r,a,i,_,d,f,s){var c,n,g,l,y,E,S,p,v,P,T,D,A,$,u,h,b,N=e.type;if(e.constructor!==void 0)return null;128&o.__u&&(f=!!(32&o.__u),i=[d=e.__e=o.__e]),(c=w.__b)&&c(e);e:if(typeof N=="function")try{if(p=e.props,v="prototype"in N&&N.prototype.render,P=(c=N.contextType)&&r[c.__c],T=c?P?P.props.value:c.__:r,o.__c?S=(n=e.__c=o.__c).__=n.__E:(v?e.__c=n=new N(p,T):(e.__c=n=new q(p,T),n.constructor=N,n.render=ot),P&&P.sub(n),n.state||(n.state={}),n.__n=r,g=n.__d=!0,n.__h=[],n._sb=[]),v&&n.__s==null&&(n.__s=n.state),v&&N.getDerivedStateFromProps!=null&&(n.__s==n.state&&(n.__s=z({},n.__s)),z(n.__s,N.getDerivedStateFromProps(p,n.__s))),l=n.props,y=n.state,n.__v=e,g)v&&N.getDerivedStateFromProps==null&&n.componentWillMount!=null&&n.componentWillMount(),v&&n.componentDidMount!=null&&n.__h.push(n.componentDidMount);else{if(v&&N.getDerivedStateFromProps==null&&p!==l&&n.componentWillReceiveProps!=null&&n.componentWillReceiveProps(p,T),e.__v==o.__v||!n.__e&&n.shouldComponentUpdate!=null&&n.shouldComponentUpdate(p,n.__s,T)===!1){for(e.__v!=o.__v&&(n.props=p,n.state=n.__s,n.__d=!1),e.__e=o.__e,e.__k=o.__k,e.__k.some(function(C){C&&(C.__=e)}),D=0;D<n._sb.length;D++)n.__h.push(n._sb[D]);n._sb=[],n.__h.length&&_.push(n);break e}n.componentWillUpdate!=null&&n.componentWillUpdate(p,n.__s,T),v&&n.componentDidUpdate!=null&&n.__h.push(function(){n.componentDidUpdate(l,y,E)})}if(n.context=T,n.props=p,n.__P=t,n.__e=!1,A=w.__r,$=0,v){for(n.state=n.__s,n.__d=!1,A&&A(e),c=n.render(n.props,n.state,n.context),u=0;u<n._sb.length;u++)n.__h.push(n._sb[u]);n._sb=[]}else do n.__d=!1,A&&A(e),c=n.render(n.props,n.state,n.context),n.state=n.__s;while(n.__d&&++$<25);n.state=n.__s,n.getChildContext!=null&&(r=z(z({},r),n.getChildContext())),v&&!g&&n.getSnapshotBeforeUpdate!=null&&(E=n.getSnapshotBeforeUpdate(l,y)),h=c,c!=null&&c.type===J&&c.key==null&&(h=Ne(c.props.children)),d=xe(t,B(h)?h:[h],e,o,r,a,i,_,d,f,s),n.base=e.__e,e.__u&=-161,n.__h.length&&_.push(n),S&&(n.__E=n.__=null)}catch(C){if(e.__v=null,f||i!=null)if(C.then){for(e.__u|=f?160:128;d&&d.nodeType==8&&d.nextSibling;)d=d.nextSibling;i[i.indexOf(d)]=null,e.__e=d}else{for(b=i.length;b--;)oe(i[b]);ee(e)}else e.__e=o.__e,e.__k=o.__k,C.then||ee(e);w.__e(C,e,o)}else i==null&&e.__v==o.__v?(e.__k=o.__k,e.__e=o.__e):d=e.__e=tt(o.__e,e,o,r,a,i,_,f,s);return(c=w.diffed)&&c(e),128&e.__u?void 0:d}function ee(t){t&&t.__c&&(t.__c.__e=!0),t&&t.__k&&t.__k.forEach(ee)}function Se(t,e,o){for(var r=0;r<o.length;r++)ne(o[r],o[++r],o[++r]);w.__c&&w.__c(e,t),t.some(function(a){try{t=a.__h,a.__h=[],t.some(function(i){i.call(a)})}catch(i){w.__e(i,a.__v)}})}function Ne(t){return typeof t!="object"||t==null||t.__b&&t.__b>0?t:B(t)?t.map(Ne):z({},t)}function tt(t,e,o,r,a,i,_,d,f){var s,c,n,g,l,y,E,S=o.props||M,p=e.props,v=e.type;if(v=="svg"?a="http://www.w3.org/2000/svg":v=="math"?a="http://www.w3.org/1998/Math/MathML":a||(a="http://www.w3.org/1999/xhtml"),i!=null){for(s=0;s<i.length;s++)if((l=i[s])&&"setAttribute"in l==!!v&&(v?l.localName==v:l.nodeType==3)){t=l,i[s]=null;break}}if(t==null){if(v==null)return document.createTextNode(p);t=document.createElementNS(a,v,p.is&&p),d&&(w.__m&&w.__m(e,i),d=!1),i=null}if(v==null)S===p||d&&t.data==p||(t.data=p);else{if(i=i&&j.call(t.childNodes),!d&&i!=null)for(S={},s=0;s<t.attributes.length;s++)S[(l=t.attributes[s]).name]=l.value;for(s in S)if(l=S[s],s!="children"){if(s=="dangerouslySetInnerHTML")n=l;else if(!(s in p)){if(s=="value"&&"defaultValue"in p||s=="checked"&&"defaultChecked"in p)continue;O(t,s,null,l,a)}}for(s in p)l=p[s],s=="children"?g=l:s=="dangerouslySetInnerHTML"?c=l:s=="value"?y=l:s=="checked"?E=l:d&&typeof l!="function"||S[s]===l||O(t,s,l,S[s],a);if(c)d||n&&(c.__html==n.__html||c.__html==t.innerHTML)||(t.innerHTML=c.__html),e.__k=[];else if(n&&(t.innerHTML=""),xe(e.type=="template"?t.content:t,B(g)?g:[g],e,o,r,v=="foreignObject"?"http://www.w3.org/1999/xhtml":a,i,_,i?i[0]:o.__k&&F(o,0),d,f),i!=null)for(s=i.length;s--;)oe(i[s]);d||(s="value",v=="progress"&&y==null?t.removeAttribute("value"):y!=null&&(y!==t[s]||v=="progress"&&!y||v=="option"&&y!=S[s])&&O(t,s,y,S[s],a),s="checked",E!=null&&E!=t[s]&&O(t,s,E,S[s],a))}return t}function ne(t,e,o){try{if(typeof t=="function"){var r=typeof t.__u=="function";r&&t.__u(),r&&e==null||(t.__u=t(e))}else t.current=e}catch(a){w.__e(a,o)}}function Ce(t,e,o){var r,a;if(w.unmount&&w.unmount(t),(r=t.ref)&&(r.current&&r.current!=t.__e||ne(r,null,e)),(r=t.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(i){w.__e(i,e)}r.base=r.__P=null}if(r=t.__k)for(a=0;a<r.length;a++)r[a]&&Ce(r[a],e,o||typeof t.type!="function");o||oe(t.__e),t.__c=t.__=t.__e=void 0}function ot(t,e,o){return this.constructor(t,o)}function Ee(t,e,o){var r,a,i,_;e==document&&(e=document.documentElement),w.__&&w.__(t,e),a=(r=typeof o=="function")?null:o&&o.__k||e.__k,i=[],_=[],re(e,t=(!r&&o||e).__k=Ze(J,null,[t]),a||M,M,e.namespaceURI,!r&&o?[o]:a?null:e.firstChild?j.call(e.childNodes):null,i,!r&&o?o:a?a.__e:e.firstChild,r,_),Se(i,t,_)}j=be.slice,w={__e:function(t,e,o,r){for(var a,i,_;e=e.__;)if((a=e.__c)&&!a.__)try{if((i=a.constructor)&&i.getDerivedStateFromError!=null&&(a.setState(i.getDerivedStateFromError(t)),_=a.__d),a.componentDidCatch!=null&&(a.componentDidCatch(t,r||{}),_=a.__d),_)return a.__E=a}catch(d){t=d}throw t}},he=0,Ye=function(t){return t!=null&&t.constructor===void 0},q.prototype.setState=function(t,e){var o;o=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=z({},this.state),typeof t=="function"&&(t=t(z({},o),this.props)),t&&z(o,t),t!=null&&this.__v&&(e&&this._sb.push(e),pe(this))},q.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),pe(this))},q.prototype.render=J,U=[],me=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,ve=function(t,e){return t.__v.__b-e.__v.__b},W.__r=0,we=/(PointerCapture)$|Capture$/i,te=0,Z=ge(!1),K=ge(!0),Qe=0;var ae,x,ie,Pe,_e=0,Me=[],k=w,Te=k.__b,ze=k.__r,He=k.diffed,De=k.__c,Ae=k.unmount,Ue=k.__;function rt(t,e){k.__h&&k.__h(x,t,_e||e),_e=0;var o=x.__H||(x.__H={__:[],__h:[]});return t>=o.__.length&&o.__.push({}),o.__[t]}function H(t){return _e=1,nt(Ie,t)}function nt(t,e,o){var r=rt(ae++,2);if(r.t=t,!r.__c&&(r.__=[o?o(e):Ie(void 0,e),function(d){var f=r.__N?r.__N[0]:r.__[0],s=r.t(f,d);f!==s&&(r.__N=[s,r.__[1]],r.__c.setState({}))}],r.__c=x,!x.__f)){var a=function(d,f,s){if(!r.__c.__H)return!0;var c=r.__c.__H.__.filter(function(g){return!!g.__c});if(c.every(function(g){return!g.__N}))return!i||i.call(this,d,f,s);var n=r.__c.props!==d;return c.forEach(function(g){if(g.__N){var l=g.__[0];g.__=g.__N,g.__N=void 0,l!==g.__[0]&&(n=!0)}}),i&&i.call(this,d,f,s)||n};x.__f=!0;var i=x.shouldComponentUpdate,_=x.componentWillUpdate;x.componentWillUpdate=function(d,f,s){if(this.__e){var c=i;i=void 0,a(d,f,s),i=c}_&&_.call(this,d,f,s)},x.shouldComponentUpdate=a}return r.__N||r.__}function it(){for(var t;t=Me.shift();)if(t.__P&&t.__H)try{t.__H.__h.forEach(V),t.__H.__h.forEach(se),t.__H.__h=[]}catch(e){t.__H.__h=[],k.__e(e,t.__v)}}k.__b=function(t){x=null,Te&&Te(t)},k.__=function(t,e){t&&e.__k&&e.__k.__m&&(t.__m=e.__k.__m),Ue&&Ue(t,e)},k.__r=function(t){ze&&ze(t),ae=0;var e=(x=t.__c).__H;e&&(ie===x?(e.__h=[],x.__h=[],e.__.forEach(function(o){o.__N&&(o.__=o.__N),o.u=o.__N=void 0})):(e.__h.forEach(V),e.__h.forEach(se),e.__h=[],ae=0)),ie=x},k.diffed=function(t){He&&He(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(Me.push(e)!==1&&Pe===k.requestAnimationFrame||((Pe=k.requestAnimationFrame)||at)(it)),e.__H.__.forEach(function(o){o.u&&(o.__H=o.u),o.u=void 0})),ie=x=null},k.__c=function(t,e){e.some(function(o){try{o.__h.forEach(V),o.__h=o.__h.filter(function(r){return!r.__||se(r)})}catch(r){e.some(function(a){a.__h&&(a.__h=[])}),e=[],k.__e(r,o.__v)}}),De&&De(t,e)},k.unmount=function(t){Ae&&Ae(t);var e,o=t.__c;o&&o.__H&&(o.__H.__.forEach(function(r){try{V(r)}catch(a){e=a}}),o.__H=void 0,e&&k.__e(e,o.__v))};var Fe=typeof requestAnimationFrame=="function";function at(t){var e,o=function(){clearTimeout(r),Fe&&cancelAnimationFrame(e),setTimeout(t)},r=setTimeout(o,35);Fe&&(e=requestAnimationFrame(o))}function V(t){var e=x,o=t.__c;typeof o=="function"&&(t.__c=void 0,o()),x=e}function se(t){var e=x;t.__c=t.__(),x=e}function Ie(t,e){return typeof e=="function"?e(t):e}var de=class{constructor(){this.baseURL=window.location.origin}async fetch(e,o={}){let r=`${this.baseURL}${e}`,a={headers:{"Content-Type":"application/json",...o.headers},...o},i=document.querySelector("script[data-key]");i&&(a.headers["X-API-Key"]=i.getAttribute("data-key"));try{let _=await fetch(r,a);if(!_.ok){let d=await _.json();throw new Error(d.error||`HTTP ${_.status}`)}return await _.json()}catch(_){throw console.error("API request failed:",_),_}}async getConfig(){return this.fetch("/api/widget/config")}async getAddressSuggestions(e){return this.fetch("/api/dadata/suggest",{method:"POST",body:JSON.stringify({query:e})})}async calculateDistance(e,o,r,a){return this.fetch("/api/dadata/distance",{method:"POST",body:JSON.stringify({from_lat:e,from_lon:o,to_lat:r,to_lon:a})})}async createOrder(e){return this.fetch("/api/orders",{method:"POST",body:JSON.stringify(e)})}async getBonusBalance(e){return this.fetch(`/api/customers/bonus?phone=${encodeURIComponent(e)}`)}},G=new de;var m=L(I(),1),dt=({config:t})=>{let[e,o]=H({from_address:"",to_address:"",from_lat:null,from_lon:null,to_lat:null,to_lon:null,floor_num:"",no_elevator:!1,weight:"",diagnosis:"",phone:"",email:"",round_trip:!1,payment_method:"",medical_escort:!1,news_subscribe:!1,personal_data:!1,customer_name:"",comment:""}),[r,a]=H({from:[],to:[]}),[i,_]=H(null),[d,f]=H(null),[s,c]=H(!1),[n,g]=H({}),[l,y]=H(!1),[E,S]=H({field:null,index:-1}),p=t.settings,v=async(u,h)=>{if(o(b=>({...b,[`${h}_address`]:u})),u.length<3){a(b=>({...b,[h]:[]}));return}try{let b=await G.fetch("/api/dadata/suggest",{method:"POST",body:JSON.stringify({query:u})});a(N=>({...N,[h]:b.suggestions}))}catch(b){console.error("Address suggestions error:",b)}},P=(u,h)=>{o(X=>({...X,[`${h}_address`]:u.value,[`${h}_lat`]:u.data.geo_lat,[`${h}_lon`]:u.data.geo_lon})),a(X=>({...X,[h]:[]}));let b=h==="from"?"to":"from",N=e[`${b}_lat`],C=e[`${b}_lon`];u.data.geo_lat&&u.data.geo_lon&&N&&C&&T(h==="from"?u.data.geo_lat:N,h==="from"?u.data.geo_lon:C,h==="from"?N:u.data.geo_lat,h==="from"?C:u.data.geo_lon)},T=async(u,h,b,N)=>{try{c(!0);let C=await G.fetch("/api/dadata/distance",{method:"POST",body:JSON.stringify({from_lat:u,from_lon:h,to_lat:b,to_lon:N})});_(C.distance),D(C.distance)}catch(C){console.error("Distance calculation error:",C)}finally{c(!1)}},D=u=>{let h={distance:u||0,weight:parseFloat(e.weight)||0,floor:parseInt(e.floor_num)||1,noElevator:e.no_elevator,roundTrip:e.round_trip,medEscort:e.medical_escort,settings:p},b=p.pricing.base;b+=(u||0)*p.pricing.per_km,h.weight>p.pricing.overweight_limit&&(b+=p.pricing.overweight_fee),h.noElevator&&h.floor>1&&(b+=(h.floor-1)*p.pricing.floor_fee),h.medEscort&&(b+=p.pricing.escort_fee),h.roundTrip&&(b*=1.8),f(Math.round(b))},A=async u=>{u.preventDefault(),c(!0),g({});try{let h=await G.fetch("/api/orders",{method:"POST",body:JSON.stringify({...e,distance:i,price:d})});y(!0)}catch(h){g({submit:h.message||"\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u0437\u0430\u044F\u0432\u043A\u0438"})}finally{c(!1)}},$=(u,h)=>{o(b=>({...b,[u]:h})),i!==null&&["weight","floor_num","no_elevator","round_trip","medical_escort"].includes(u)&&D(i)};return l?(0,m.jsx)("div",{className:"wdg-calculator",children:(0,m.jsxs)("div",{className:"wdg-success",children:[(0,m.jsx)("h3",{children:"\u0417\u0430\u044F\u0432\u043A\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430!"}),(0,m.jsx)("p",{children:"\u041C\u044B \u0441\u0432\u044F\u0436\u0435\u043C\u0441\u044F \u0441 \u0432\u0430\u043C\u0438 \u0432 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043C\u044F."})]})}):(0,m.jsxs)("div",{className:"wdg-calculator",children:[(0,m.jsx)("h2",{className:"wdg-title",children:"\u041C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0430\u044F \u043F\u0435\u0440\u0435\u0432\u043E\u0437\u043A\u0430"}),(0,m.jsxs)("form",{onSubmit:A,children:[p.fields.from_address&&(0,m.jsxs)("div",{className:"wdg-form-group",children:[(0,m.jsxs)("label",{className:"wdg-label",children:["\u0410\u0434\u0440\u0435\u0441 \u043E\u0442\u043A\u0443\u0434\u0430 ",p.required.includes("from_address")&&"*"]}),(0,m.jsxs)("div",{className:"wdg-autocomplete",children:[(0,m.jsx)("input",{type:"text",className:"wdg-input",value:e.from_address,onInput:u=>v(u.target.value,"from"),placeholder:"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441"}),r.from.length>0&&(0,m.jsx)("div",{className:"wdg-suggestions",children:r.from.map((u,h)=>(0,m.jsx)("div",{className:"wdg-suggestion",onClick:()=>P(u,"from"),children:u.value},h))})]}),n.from_address&&(0,m.jsx)("div",{className:"wdg-error",children:n.from_address})]}),p.fields.to_address&&(0,m.jsxs)("div",{className:"wdg-form-group",children:[(0,m.jsxs)("label",{className:"wdg-label",children:["\u0410\u0434\u0440\u0435\u0441 \u043A\u0443\u0434\u0430 ",p.required.includes("to_address")&&"*"]}),(0,m.jsxs)("div",{className:"wdg-autocomplete",children:[(0,m.jsx)("input",{type:"text",className:"wdg-input",value:e.to_address,onInput:u=>v(u.target.value,"to"),placeholder:"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441"}),r.to.length>0&&(0,m.jsx)("div",{className:"wdg-suggestions",children:r.to.map((u,h)=>(0,m.jsx)("div",{className:"wdg-suggestion",onClick:()=>P(u,"to"),children:u.value},h))})]}),n.to_address&&(0,m.jsx)("div",{className:"wdg-error",children:n.to_address})]}),i!==null&&d!==null&&(0,m.jsxs)("div",{className:"wdg-result",children:[(0,m.jsxs)("div",{className:"wdg-price",children:[d," \u20BD"]}),(0,m.jsxs)("div",{children:["\u0420\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435: ",i," \u043A\u043C"]})]}),p.fields.phone&&(0,m.jsxs)("div",{className:"wdg-form-group",children:[(0,m.jsxs)("label",{className:"wdg-label",children:["\u0422\u0435\u043B\u0435\u0444\u043E\u043D ",p.required.includes("phone")&&"*"]}),(0,m.jsx)("input",{type:"tel",className:"wdg-input",value:e.phone,onInput:u=>$("phone",u.target.value),placeholder:"+7 (___) ___-__-__"}),n.phone&&(0,m.jsx)("div",{className:"wdg-error",children:n.phone})]}),(0,m.jsx)("button",{type:"submit",className:"wdg-button",disabled:s||!d,children:s?"\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430...":"\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"}),n.submit&&(0,m.jsx)("div",{className:"wdg-error",children:n.submit})]})]})},Re=dt;var qe=L(I(),1),lt={client_id:"test-client-001",company_name:"\u0422\u0435\u0441\u0442\u043E\u0432\u0430\u044F \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0430\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F",settings:{fields:{from_address:!0,to_address:!0,floor:!0,no_elevator:!0,diagnosis:!0,weight:!0,phone:!0,email:!0,round_trip:!0,payment_method:!0,medical_escort:!0,news_subscribe:!0,personal_data:!0},required:["phone","from_address","to_address","personal_data"],pricing:{base:1500,per_km:45,floor_fee:150,overweight_limit:100,overweight_fee:500,escort_fee:1e3},bonus:{enabled:!0,percent:5},personal_data_url:"/privacy",ui:{primary_color:"#3b82f6",bg_color:"#ffffff",font_size:"16px",border_radius:"8px"}}},Q=class{constructor(){this.container=null,this.shadow=null,this.config=lt}init(e){try{this.createContainer(),this.applyStyles(),Ee((0,qe.jsx)(Re,{config:this.config}),this.shadow.appendChild(document.createElement("div"))),console.log("Widget initialized with mock data")}catch(o){console.error("Widget initialization failed:",o),this.showError("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043A\u0430\u043B\u044C\u043A\u0443\u043B\u044F\u0442\u043E\u0440")}}createContainer(){this.container=document.createElement("div"),this.container.id="medical-calculator-widget",this.shadow=this.container.attachShadow({mode:"open"});let e=document.createElement("style");e.textContent=this.getStyles(),this.shadow.appendChild(e),document.body.appendChild(this.container)}applyStyles(){let e=this.shadow.host;if(e&&this.config.settings.ui){let o=this.config.settings.ui;e.style.setProperty("--wdg-primary",o.primary_color||"#3b82f6"),e.style.setProperty("--wdg-bg",o.bg_color||"#ffffff"),e.style.setProperty("--wdg-font-size",o.font_size||"16px"),e.style.setProperty("--wdg-radius",o.border_radius||"8px")}}getStyles(){return`
      :host {
        --wdg-primary: #3b82f6;
        --wdg-bg: #ffffff;
        --wdg-text: #374151;
        --wdg-border: #d1d5db;
        --wdg-error: #ef4444;
        --wdg-success: #10b981;
        --wdg-font-size: 16px;
        --wdg-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: var(--wdg-font-size);
        line-height: 1.5;
        color: var(--wdg-text);
      }

      .wdg-calculator {
        background: var(--wdg-bg);
        border: 1px solid var(--wdg-border);
        border-radius: var(--wdg-radius);
        padding: 20px;
        max-width: 500px;
        margin: 20px auto;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }

      .wdg-title {
        font-size: 1.25em;
        font-weight: 600;
        margin-bottom: 20px;
        color: var(--wdg-text);
      }

      .wdg-form-group {
        margin-bottom: 16px;
      }

      .wdg-label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
        color: var(--wdg-text);
      }

      .wdg-input, .wdg-select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--wdg-border);
        border-radius: var(--wdg-radius);
        font-size: var(--wdg-font-size);
        transition: border-color 0.2s;
        box-sizing: border-box;
      }

      .wdg-input:focus, .wdg-select:focus {
        outline: none;
        border-color: var(--wdg-primary);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .wdg-checkbox-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .wdg-checkbox {
        width: auto;
        margin: 0;
      }

      .wdg-result {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        border-radius: var(--wdg-radius);
        padding: 16px;
        margin: 20px 0;
        text-align: center;
      }

      .wdg-price {
        font-size: 1.5em;
        font-weight: 600;
        color: var(--wdg-success);
        margin-bottom: 8px;
      }

      .wdg-button {
        background: var(--wdg-primary);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: var(--wdg-radius);
        font-size: var(--wdg-font-size);
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        width: 100%;
      }

      .wdg-button:hover {
        background: #2563eb;
      }

      .wdg-button:disabled {
        background: #9ca3af;
        cursor: not-allowed;
      }

      .wdg-error {
        color: var(--wdg-error);
        font-size: 0.875em;
        margin-top: 4px;
      }

      .wdg-success {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: var(--wdg-success);
        padding: 16px;
        border-radius: var(--wdg-radius);
        text-align: center;
      }

      @media (max-width: 640px) {
        .wdg-calculator {
          margin: 10px;
          padding: 16px;
        }
      }
    `}showError(e){if(document.body){let o=document.createElement("div");o.style.cssText=`
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `,o.textContent=e,document.body.appendChild(o),setTimeout(()=>{o.parentNode&&o.parentNode.removeChild(o)},5e3)}}};window.MedicalCalculatorWidget=Q;(function(){let t=document.querySelector("script[data-key]");if(t){let e=t.getAttribute("data-key");new Q().init(e)}})();})();
/*! Bundled license information:

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
