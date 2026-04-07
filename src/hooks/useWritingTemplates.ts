import { useState, useEffect, useCallback } from 'react';

export interface WritingTemplate {
  id: string;
  name: string;
  mode: string;
  style: string;
  length: string;
  audience: string;
  prompt: string;
}

export function useWritingTemplates() {
  const [templates, setTemplates] = useState<WritingTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/writing-templates');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const saveTemplate = async (
    name: string,
    params: Omit<WritingTemplate, 'id' | 'name'>
  ) => {
    const res = await fetch('/api/writing-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...params }),
    });
    if (res.ok) await fetchTemplates();
    return res.ok;
  };

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/writing-templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  return { templates, isLoading, saveTemplate, deleteTemplate, refetch: fetchTemplates };
}
