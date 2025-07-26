const response = await fetch('add.wasm');
const wasmBytes = await response.arrayBuffer();
const { instance } = await WebAssembly.instantiate(wasmBytes, {
  env: {print: (result) => { console.log(`The result is ${result}`); }} 
});

const wasm = instance.exports;

console.log("WASM loaded!");
console.log(wasm.add(1,2));