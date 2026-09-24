export const eegHeadset = {
    id: 'hardware-eeg-headset',
    title: 'An EEG Headset That Classifies On-Device',
    date: '2025-04-01',
    previewImage: '/previews/hardware-eeg-headset.png',
    blurb: 'A miniature EEG on a Teensy 4.1, with the classifier living in 8MB of RAM.',
    previewAspect: 'wide',
    category: 'hardware',
    artifact: { modelUrl: '/models/soldering_station.glb', targetSize: 1 },
    connections: [
        {
            workId: 'hardware-custom-rom',
            sentence: 'Both of these are really about refusing to let my own data leave the device.'
        },
        {
            workId: 'software-mlx',
            sentence: 'Caring what a model costs to run is the same instinct from the other end of the scale.'
        }
    ],
    editorial: {
        body: [
            "A miniature EEG built on a Teensy 4.1 in C++ and Python, with a quantized 1D CNN running on-device to classify the signal — inside 8MB of RAM.",
            "The 8MB is the entire story and I'd rather talk about it than about the neuroscience. A constraint that hard removes almost every choice you would otherwise agonise over. There is no room for a framework, so there is no framework. There is no room to keep a buffer you might want later, so the signal processing has to be genuinely streaming rather than nominally streaming. Quantization stops being an optimisation you apply at the end and becomes a property the architecture is designed around from the first line. I have never written cleaner code than when I could not afford to write any more of it.",
            "It would have been far easier to stream the samples to a laptop and classify them there. I specifically did not want that, and the reason is not performance. It's that the moment brain data leaves the device it is just data, subject to every ordinary thing that happens to data. Keeping the classifier on the microcontroller means the raw signal never exists anywhere I would have to trust. That is a design goal, not a technical detail, and it's the same one behind the phone.",
            "I'll be straight about what this is: a hobbyist EEG is not a medical instrument, the electrode contact is the limiting factor rather than the classifier, and the classes it can separate are coarse. I'm not claiming to read minds on a microcontroller. What I got out of it was a genuine feel for the full stack of one signal — from an electrode with terrible impedance, through filtering, into a quantized model, and out as a decision — with nobody's abstraction in between.",
            "Building a thing that reads your own brain is also just a strange act, and I'd recommend it on those grounds alone. There is a specific moment where the classifier fires because of something you did deliberately with your own head, and it is unlike any other kind of working software."
        ],
    }
};

export const customRom = {
    id: 'hardware-custom-rom',
    title: 'A Phone That Answers To Me',
    date: '2025-10-01',
    previewImage: '/previews/hardware-custom-rom.png',
    blurb: 'Extending LineageOS in Zig to collect my own data at the kernel, for a digital twin.',
    previewAspect: 'tall',
    category: 'hardware',
    artifact: { modelUrl: '/models/pixel.glb', targetSize: 0.5 },
    connections: [
        {
            workId: 'hardware-eeg-headset',
            sentence: 'The same argument, one layer down the stack and considerably more personal.'
        }
    ],
    editorial: {
        body: [
            "I extended the LineageOS ROM with a data collection kernel written in Zig, to build a digital twin of myself from my own phone.",
            "\"Digital twin\" is a big phrase and it deserves unpacking, because it sounds like a product and it isn't one. What I mean is narrow: a model of my own behaviour, built from my own telemetry, that lives on hardware I control. Not a profile that someone sells, and not a feature. The premise is that the most accurate dataset about me is already being collected continuously — it is simply being collected by other people, and I get back a worse version of it in the form of recommendations.",
            "The reason this has to happen at the kernel rather than as an app is the whole argument. An app sees what the OS chooses to show it, and every mobile platform has spent fifteen years getting better at deciding what an app is allowed to know about you. That is mostly good — it is the correct default when the app is someone else's. It is exactly wrong when the app is yours and the subject is you. Owning the ROM is the only position from which \"my data\" means the thing it sounds like it means.",
            "Zig is a slightly perverse choice and I'd defend it. I wanted manual control over allocation in a component that runs continuously on a battery, no hidden control flow in something sitting under the whole system, and a comptime story that made the C interop with the existing Android surface tolerable rather than miserable. It also forced me to understand every allocation, which on a phone is the point.",
            "The honest status: this is a personal device running personal software, and I would not hand it to anybody else. A custom ROM with a kernel component you wrote yourself is a security posture, and mine is \"I am the only user and I accept it.\" The twin is early. What I have so far is the collection layer and enough of a model to know the idea is sound.",
            "I think the general version of this matters more than my phone does. The default arrangement is that the richest model of your behaviour is owned by whoever has the best telemetry, and that is never you. It does not have to be that way, and it is worth knowing what it takes to change it even at the scale of one person and one handset."
        ],
    }
};

export const hardware = [eegHeadset, customRom];
