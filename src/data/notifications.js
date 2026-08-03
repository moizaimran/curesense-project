const notifications = [
    {
        id: 1,
        type: "new_patient",
        title: "New Patient Registered",
        message: "Ali Khan submitted symptoms for AI analysis.",
        patientId: 1,
        patientName: "Ali Khan",
        severity: "Pending",
        createdAt: "2 min ago",
        read: false,
    },

    {
        id: 2,
        type: "ai_completed",
        title: "AI Diagnosis Completed",
        message: "AI generated diagnosis for Sara Ahmed.",
        patientId: 2,
        patientName: "Sara Ahmed",
        severity: "Medium",
        confidence: 94,
        createdAt: "8 min ago",
        read: false,
    },

    {
        id: 3,
        type: "high_severity",
        title: "High Severity Case",
        message: "Ahmed Raza requires immediate review.",
        patientId: 3,
        patientName: "Ahmed Raza",
        severity: "High",
        confidence: 97,
        createdAt: "15 min ago",
        read: false,
    },

    {
        id: 4,
        type: "image_uploaded",
        title: "Medical Image Uploaded",
        message: "Chest X-Ray uploaded for Aimen Khan.",
        patientId: 7,
        patientName: "Aimen Khan",
        imageType: "Chest X-Ray",
        createdAt: "30 min ago",
        read: true,
    },

    {
        id: 5,
        type: "doctor_review",
        title: "Doctor Review Completed",
        message: "Diagnosis approved for Hassan Khan.",
        patientId: 8,
        patientName: "Hassan Khan",
        reviewedBy: "Dr. Tanveer Ahmad",
        createdAt: "1 hour ago",
        read: true,
    },

    {
        id: 6,
        type: "follow_up",
        title: "Follow-up Recommended",
        message: "AI recommends follow-up consultation for Alina Khan.",
        patientId: 10,
        patientName: "Alina Khan",
        createdAt: "2 hours ago",
        read: false,
    },
];

export default notifications;