    import { initializeApp } from "firebase/app";
    import { getAuth } from "firebase/auth";

    const firebaseConfig = {
    apiKey: your api here",
    authDomain: "ai-fairness-auditor.firebaseapp.com",
    projectId: "ai-fairness-auditor",
    storageBucket: "ai-fairness-auditor.firebasestorage.app",
    messagingSenderId: "700484343335",
    appId: "1:700484343335:web:8152ff2988ae49a89b6002",
    };

    const app = initializeApp(firebaseConfig);
    export const auth = getAuth(app);

    
