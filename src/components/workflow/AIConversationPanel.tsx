import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AIMessage } from './AIMessage';
import { useWorkflowStore } from '@/store/workflowStore';
import { Loader2, Send, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIConversationPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [conversationPhase, setConversationPhase] = useState<'planning' | 'approved' | 'executing'>('planning');
  const [workflowPlan, setWorkflowPlan] = useState<string | null>(null);
  const [showApprovalButton, setShowApprovalButton] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { workflow, selectedNodeIds, validationErrors, toggleAIConversation } = useWorkflowStore();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-close when node is selected
  useEffect(() => {
    if (selectedNodeIds.length > 0) {
      toggleAIConversation();
    }
  }, [selectedNodeIds, toggleAIConversation]);

  const handleSend = async (agentType: 'user' | 'system' = 'user', planOverride?: string) => {
    if ((!input.trim() && !planOverride) || isLoading) return;

    const messageText = planOverride || input.trim();
    
    // Only add user message and clear input if not a plan override
    if (!planOverride) {
      const userMessage: Message = {
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
    }
    
    setIsLoading(true);

    try {
      // Prepare workflow context
      const workflowContext = {
        id: workflow.id,
        nodes: workflow.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: n.label,
          config: n.config,
        })),
        edgesCount: workflow.edges.length,
        selectedNodes: selectedNodeIds,
        validationErrors: validationErrors,
      };

      // Prepare conversation history
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const requestBody: any = {
        message: messageText,
        workflowContext,
        conversationHistory,
        agentType,
      };

      // If this is an approval (system agent), include the plan
      if (agentType === 'system' && workflowPlan) {
        requestBody.workflowPlan = workflowPlan;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-conversation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Failed to get Abi//Core response');
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;
      let assistantContent = '';

      // Add initial assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            
            // Handle regular content
            const content = parsed.choices?.[0]?.delta?.content || parsed.content;
            if (content) {
              assistantContent += content;
              
              // Workflow plan detection is now handled via tool calls below
              
              // Update the last message
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: assistantContent,
                };
                return newMessages;
              });
            }
            
            // Handle tool calls
            if (parsed.tool_call) {
              const toolName = parsed.tool_call.name;
              
              // Handle submit_workflow_plan tool
              if (toolName === 'submit_workflow_plan') {
                const planData = parsed.tool_call.arguments;
                setWorkflowPlan(planData.plan);
                setShowApprovalButton(true);
                
                // Add a nice message about the plan submission
                assistantContent += `\n\n✅ **Workflow Plan Ready for Approval**\n\n📋 ${planData.summary}\n\n📊 **Plan Details:**\n- ${planData.nodeCount} nodes\n- ${planData.edgeCount} connections`;
              } else {
                // Existing tool messages
                const toolMsg = toolName === 'create_workflow_node' 
                  ? '🔧 Creating node...' 
                  : toolName === 'connect_workflow_nodes' 
                  ? '🔗 Connecting nodes...' 
                  : '🔍 Analyzing node schemas...';
                
                assistantContent += `\n\n${toolMsg}`;
              }
              
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: assistantContent,
                };
                return newMessages;
              });
            }
            
            // Handle tool results
            if (parsed.tool_result) {
              const result = parsed.tool_result.result;
              const toolName = parsed.tool_result.name;
              
              // Special handling for submit_workflow_plan
              if (toolName === 'submit_workflow_plan') {
                // Don't add duplicate message since we already added it in tool_call
                // Just ensure the button is visible
                setShowApprovalButton(true);
              } else if (result.success && result.message) {
                assistantContent += `\n✅ ${result.message}`;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: assistantContent,
                  };
                  return newMessages;
                });
                
                // Clear workflow plan after system agent executes nodes
                if (agentType === 'system' && (toolName === 'create_workflow_node' || toolName === 'connect_workflow_nodes')) {
                  setWorkflowPlan(null);
                }
                
                // Reload workflow to show new nodes/edges (only for actual modifications)
                if (toolName === 'create_workflow_node' || toolName === 'connect_workflow_nodes') {
                  setTimeout(() => {
                    window.location.reload();
                  }, 1500);
                }
              } else if (result.error) {
                assistantContent += `\n❌ Error: ${result.error}`;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: assistantContent,
                  };
                  return newMessages;
                });
              }
            }
            
            // Handle errors
            if (parsed.error) {
              assistantContent += `\n\n⚠️ Error: ${parsed.error}`;
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: assistantContent,
                };
                return newMessages;
              });
            }
            
            if (parsed.tool_error) {
              assistantContent += `\n\n⚠️ Tool error: ${parsed.tool_error.error}`;
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: assistantContent,
                };
                return newMessages;
              });
            }
          } catch {
            // Incomplete JSON, put it back
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as
              | string
              | undefined;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: assistantContent,
                };
                return newMessages;
              });
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (error) {
      console.error('Abi//Core conversation error:', error);
      toast.error('Failed to get Abi//Core response');
      // Remove the empty assistant message
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearConversation = () => {
    setMessages([]);
    setConversationPhase('planning');
    setWorkflowPlan(null);
    setShowApprovalButton(false);
    toast.success('Conversation cleared');
  };

  const handleApproveWorkflow = async () => {
    if (!workflowPlan) return;
    
    setShowApprovalButton(false);
    setConversationPhase('approved');
    
    // Add user approval message
    const approvalMessage: Message = {
      role: 'user',
      content: 'I approve this workflow plan. Please build it.',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, approvalMessage]);
    
    // Send to system agent
    setConversationPhase('executing');
    
    try {
      await handleSend('system', 'Execute the approved workflow plan.');
      setConversationPhase('planning');
      setWorkflowPlan(null);
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error('Failed to execute workflow plan');
      setConversationPhase('planning');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && conversationPhase !== 'executing') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "border-l border-border bg-card flex flex-col h-full transition-all duration-300 ease-in-out relative",
        isOpen ? "w-96" : "w-0"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -left-10 top-4 h-8 w-8 rounded-full border border-border bg-background shadow-sm z-10"
      >
        {isOpen ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>

      <div
        className={cn(
          "flex flex-col h-full transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="h-14 border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Automagic Abi//Core</h2>
            {conversationPhase !== 'planning' && (
              <div className="flex items-center gap-1.5 text-xs">
                {conversationPhase === 'executing' && (
                  <>
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    <span className="text-primary font-medium">Building...</span>
                  </>
                )}
                {conversationPhase === 'approved' && (
                  <span className="text-primary font-medium">✓ Approved</span>
                )}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearConversation}
            disabled={messages.length === 0 || conversationPhase === 'executing'}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm text-center px-4">
              Ask me anything about your workflow. I can help you plan and build workflows automatically.
            </div>
          ) : (
            <div>
              {messages.map((message, index) => (
                <AIMessage
                  key={index}
                  role={message.role}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {conversationPhase === 'executing' ? 'Building workflow...' : 'Abi//Core is thinking...'}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Approval Button */}
        {showApprovalButton && conversationPhase === 'planning' && (
          <div className="border-t border-border bg-primary/5 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0 text-primary text-lg">✓</div>
                <div>
                  <p className="text-sm font-medium">Workflow plan ready</p>
                  <p className="text-xs text-muted-foreground">
                    Review the plan above and approve to build the workflow automatically.
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleApproveWorkflow}
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                ✓ Approve & Build Workflow
              </Button>
            </div>
          </div>
        )}

        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={conversationPhase === 'executing' ? 'Building workflow...' : 'Ask about your workflow...'}
              className="min-h-[80px] resize-none"
              disabled={isLoading || conversationPhase === 'executing'}
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading || conversationPhase === 'executing'}
              size="icon"
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
