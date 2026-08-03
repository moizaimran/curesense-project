
const patients = [
    {
        id: 1,
        name: "Ali Khan",
        age: 32,
        gender: "Male",
        diagnosis: "Pneumonia",
        severity: "High",
        status: "Pending",
        uploaded: "2 hours ago",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (102°F)","Shortness of breath","Chest pain","Fatigue"],
        aiDiagnosis: {
        disease: "Pneumonia",
        confidence: 92,
        severity: "High",

        recommendedTests: [
        "Chest X-Ray",
        "Complete Blood Count (CBC)",
        "C-Reactive Protein (CRP)"
      ],

        differentialDiagnosis: [
        "Bronchitis",
        "COVID-19",
        "Tuberculosis"
      ]
    },
    medicalImages: [
        {
            id: 1,
            type: "MRI",
            fileName: "/images/MRI image1.jpg",
            uploaded: "28 July 2026",
            prediction: "Fracture",
            confidence: "94%",
            doctorReview: "Pending",
        }
    ]
    },
    {
        id: 2,
        name: "Sara Ahmed",
        age: 28,
        gender: "Female",
        diagnosis: "Migraine",
        severity: "Medium",
        status: "Reviewed",
        uploaded: "30 mins ago",
        hasImage: false,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (105°F)","Shortness of breath","Chest pain","Fatigue"],
        aiDiagnosis: {
        disease: "Lung Cancer",
        confidence: 92,
        severity: "High",

        recommendedTests: [
        "Chest X-Ray",
        "Complete Blood Count (CBC)",
        "C-Reactive Protein (CRP)"
      ],

        differentialDiagnosis: [
        "Bronchitis",
        "COVID-19",
        "Tuberculosis"
      ]
    },
    medicalImages: [
        {
            id: 2,
            type: "Chest X-Ray",
            fileName: "/images/xray1.jpg",
            uploaded: "28 July 2026",
            prediction: "Pneumonia",
            confidence: "94%",
            doctorReview: "Pending",
        }
    ]
    },
    {
        id: 3,
        name: "Ahmed Raza",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Pending",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (100°F)","Shortness of breath","Chest pain","Fatigue"],
        aiDiagnosis: {
        disease: "Pneumonia",
        confidence: 92,
        severity: "High",

        recommendedTests: [
        "Chest X-Ray",
        "Complete Blood Count (CBC)",
        "C-Reactive Protein (CRP)"
      ],

        differentialDiagnosis: [
        "Bronchitis",
        "COVID-19",
        "Tuberculosis"
      ]
    },
    medicalImages: [
        {
            id:3,
            type: "Chest X-Ray",
            fileName: "/images/xray2.jpg",
            uploaded: "28 July 2026",
            prediction: "Pneumonia",
            confidence: "94%",
            doctorReview: "Pending",
        }
    ]
    },
    {
        id: 4,
        name: "Alia Raza",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Reviewed",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (98°F)","Shortness of breath","Chest pain","Fatigue"],
        aiDiagnosis: {
        disease: "Pneumonia",
        confidence: 92,
        severity: "High",

        recommendedTests: [
        "Chest X-Ray",
        "Complete Blood Count (CBC)",
        "C-Reactive Protein (CRP)"
      ],

        differentialDiagnosis: [
        "Bronchitis",
        "COVID-19",
        "Tuberculosis"
      ]
    },
    medicalImages: [
        {
            id: 4,
            type: "Chest X-Ray",
            fileName: "/images/xray1.jpg",
            uploaded: "28 July 2026",
            prediction: "Pneumonia",
            confidence: "94%",
            doctorReview: "Pending",
        }
    ]
    },
    {
        id: 8,
        name: "Hassan khan",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Pending",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (88°F)","Shortness of breath","Chest pain","Fatigue"],
        aiDiagnosis: {
        disease: "Pneumonia",
        confidence: 92,
        severity: "High",

        recommendedTests: [
        "Chest X-Ray",
        "Complete Blood Count (CBC)",
        "C-Reactive Protein (CRP)"
      ],

        differentialDiagnosis: [
        "Bronchitis",
        "COVID-19",
        "Tuberculosis"
      ]
    },
    medicalImages: [
        {
            id:5,
            type: "MRI",
            fileName: "//images/MRI image1.jpg",
            uploaded: "28 July 2026",
            prediction: "Kidney failure",
            confidence: "94%",
            doctorReview: "Pending",
        }
    ]
    },
    {
        id: 7,
        name: "Aiman khan",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Pending",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (99°F)","Shortness of breath","Chest pain","Fatigue"],
        aiDiagnosis: {
        disease: "Pneumonia",
        confidence: 92,
        severity: "High",

        recommendedTests: [
        "Chest X-Ray",
        "Complete Blood Count (CBC)",
        "C-Reactive Protein (CRP)"
      ],

        differentialDiagnosis: [
        "Bronchitis",
        "COVID-19",
        "Tuberculosis"
      ]
    },
    medicalImages: [
        {
            id:6,
            type: "Chest X-Ray",
            fileName: "xray.png",
            uploaded: "28 July 2026",
            prediction: "Pneumonia",
            confidence: "94%",
            doctorReview: "Pending",
        }
    ]
    },
    {
        id: 34,
        name: "Ahmed Raza",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Pending",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (101°F)","Shortness of breath","Chest pain","Fatigue"],
    },
    {
        id: 56,
        name: "Ahmed Raza",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Pending",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (100°F)","Shortness of breath","Chest pain","Fatigue"],
    },
    {
        id: 9,
        name: "Ahmed Raza",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Pending",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (102°F)","Shortness of breath","Chest pain","Fatigue"],
    },
    {
        id: 10,
        name: "Ahmed Raza",
        age: 45,
        gender: "Male",
        diagnosis: "Diabetes",
        severity: "Low",
        status: "Pending",
        uploaded: "Today",
        hasImage: true,
        bloodGroup : 'B+',
        doctorNotes : '',
        symptoms : ["Persistent cough","Fever (102°F)","Shortness of breath","Chest pain","Fatigue"],
    },

    // ...rest of your patients
];

export default patients;