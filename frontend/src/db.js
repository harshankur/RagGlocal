import Dexie from 'dexie';

export const db = new Dexie('RAG_Database');

db.version(1).stores({
    threads: '++id, title, createdAt, updatedAt, isArchived',
    messages: '++id, threadId, role, content, sources, createdAt',
    documents: '++id, name, status, uploadedAt'
});

export const addThread = async (title = 'New Chat') => {
    return await db.threads.add({
        title,
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: 0
    });
};

export const addMessage = async (threadId, role, content, sources = []) => {
    const id = await db.messages.add({
        threadId,
        role,
        content,
        sources,
        createdAt: new Date()
    });

    await db.threads.update(threadId, { updatedAt: new Date() });
    return id;
};

export const getThreads = async () => {
    return await db.threads
        .where('isArchived')
        .equals(0)
        .reverse()
        .sortBy('updatedAt');
};

export const getMessages = async (threadId) => {
    return await db.messages
        .where('threadId')
        .equals(threadId)
        .sortBy('createdAt');
};

export const deleteThread = async (threadId) => {
    return await db.transaction('rw', db.threads, db.messages, async () => {
        await db.messages.where('threadId').equals(threadId).delete();
        await db.threads.delete(threadId);
    });
};
