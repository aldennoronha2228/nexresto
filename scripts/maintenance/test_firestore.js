const admin = require('firebase-admin');

const serviceAccount = {
    projectId: "restuarent-b4c70",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDSwsMJzOTmIN65\ns97ygOZnM6uUFibF06qU30GEBIlMcRUrdDiT2poG3YOtlJEdGP5zdeMjRNj/Uw8W\nnIAgH4Fof2Np4BZOygwkypb0Ht8ny6Wp7keIwQ38wf4tn2ZxIRSdFRRkxiCL+71J\nJUzavvdZMHqOjYC4EQO2AytNFrH/GAVz0WdkldF9pEjAggDsQMlZGDSCPe/8PLHC\nSaJY6UMPnG4fOUZjnJO1TzdBuBDzebEaDq0Wxc95sIl4nQ7o6qRdFBdJ3bqU4M8v\njgGyTMDPcw8bzx/34bZ6mBfF5XdpQlCZgcd2O75ZuDmew8SJQO+y09EoHe7a+ASu\nVs6WYW05AgMBAAECggEACMrTNB92FRud7wVP8bHq6rc/GyhpaatQ3HEL3KQLzkKR\nbYSlr5VZA5xOF/mwrBQU2WA7n4cJvm0KnhjdR3nI/kECNrKAe7z2ELra3UhEavaV\n7KbiGRRkrvywy9pwfZuxrnPoq+OQDAbueJSzxhRdYT0if7vreMJM81Tig47E0i1s\n5aEUha4+xoNxXhdSMaVI+w/Y3X29ByEFu6rSeCDipWWHywh4FFV4vTBLNv03tdxS\ntydhr36b0bACadLiFRMJYTXtcs+0lhGZSajyU4fdT+ImNcGj4fP1N8B+S0RKnntt\npoR5DrP16Y5uTHQfYxj8O6OrYvx4spdwGAbWueSz4QKBgQD/F72I2Dx600ttmBnQ\noRjvzeHOoMH0HKgCyqVB7Xh+1GkrvrbqgUBJH1ysATzrHP93yXoYJGS+SvNeFrHg\njX2gpGJS0jFwwr6ydtsODU1Dqd1UOWD9jf/y4Zbcx8PljGGC7jTUuZpP90uQa3eD\nrkwG2fPXpKm9u7tuptL1bJfQFQKBgQDTgqhcgrntiP4KZNTHhLJfORwv0kJBdQTH\nP4CYUyfYbh8cHvCOvzIOCQXLjZir0rqXX72EAqTscxvrWe6PjhJVKU8zc0H5gKci\nmKdXmk5ATqXTnPdwK1kiMmg5tEqXyHYL2SunV/h0bCFkM6IJ3trBFk8eKEQXvafU\nEPqCA3NNlQKBgQDJVOZttCT/1/ZnWC2/wPYahoca+zw5O8jK8z+9Kfz5NRKQySQ7\nL6oaTFtrEksPUcK7u1PW7BprKmKsNwNLNMEbYcKMlYMZ+UpjNnWrwInjxpR+Hg9T\n75g8DRpxxGTzrnljyjf+UULerFKCeJ9KWe19VtYis76YlivXqGlF9OBZBQKBgQCo\nS9eRPMealR2mwZJ5a0HO+Q9Pkdr8YJM7w3CcQ9Z5pS4F3yyEOOgoOM+upu1rEtM7\nrYeLqdr29aSqgTWMbnxx3NvTUYuWbuMOaS8GSpanHq1eExDj5OoYhsld2PJdkbk0\nNkpA7oOYh42OQHNXrUacyxaLJXkA9vy6hgP+PaaafQKBgEIrae1CYSolN5FknJmq\nOGf3MAxoMQyz5CA5VwziHfVGCIDlQBAukI9Y9fhu875g7OjTf1VI3Ir4oXMPq8tN\ng8fM8Hqpl4L7i6TIk5gI1Uc8CfoxuqsxDUNu/pp68CgR1lZ8XIwVLM5j1jX2djVQ\nWcAWrdHCqyqo1fysusYGpwdx\n-----END PRIVATE KEY-----\n",
    clientEmail: "firebase-adminsdk-fbsvc@restuarent-b4c70.iam.gserviceaccount.com",
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Since the user created a database named "restaurant" instead of "(default)"
try {
    const db = admin.firestore();

    // We can initialize it either with `getFirestore()` if we set it as default config, or maybe:
    const dbNamed = admin.firestore()._settings({ databaseId: 'restaurant' }) || new admin.firestore.Firestore({ databaseId: 'restaurant', projectId: 'restuarent-b4c70' });

    dbNamed.collection('test').doc('test').set({ hello: 'world' })
        .then(() => {
            console.log('SUCCESS USING DB: restaurant');
            process.exit(0);
        })
        .catch((e) => {
            console.error('ERROR (restaurant DB):', e.message);
            process.exit(1);
        });
} catch (e) {
    console.error("SDK error:", e.message);
}