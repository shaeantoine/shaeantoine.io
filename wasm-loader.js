const importObject = {
    env: {
        print: (result) => { console.log(`The result is ${result}`); }
    }
};

const {instance} = WebAssembly.instantiateStreaming(
    fetch('./add.wasm'),
    importObject
);

const { add } = instance.exports;

export { add }; 