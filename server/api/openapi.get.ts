export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  return {
    openapi: '3.0.3',
    info: {
      title: 'Completo API',
      version: '1.0.0',
      description: 'REST API for Completo — Kanban board management.\n\nThis spec covers endpoints useful for headless (non-browser) API usage. Frontend-internal endpoints (slug/key validation, UI column config, notifications, OAuth redirects, registration flows) are omitted.\n\nAuthenticate via session cookie (POST /auth/login) or Bearer token (create one at POST /api/user/tokens).'
    },
    servers: [
      { url: '/' }
    ],
    security: [
      { cookieAuth: [] },
      { bearerAuth: [] }
    ],
    tags: [
      { name: 'Auth', description: 'Login, logout, API tokens' },
      { name: 'Projects', description: 'Project management' },
      { name: 'Members', description: 'Project membership and invitations' },
      { name: 'Statuses', description: 'Project-level workflow statuses and board column management' },
      { name: 'Boards', description: 'Kanban board views' },
      { name: 'Lists', description: 'Table (list) views' },
      { name: 'Cards', description: 'Card CRUD, move, reorder' },
      { name: 'Tags', description: 'Project tags and card tagging' },
      { name: 'Attachments', description: 'File attachments on cards' },
      { name: 'User', description: 'User profile and account' },
      { name: 'My Tasks', description: 'Cards assigned to current user' },
      { name: 'Admin', description: 'User management, settings, AI skills (admin only)' },
      { name: 'AI', description: 'AI-powered card description generation' }
    ],
    paths: {
      // ──────────────────────────────────────
      // Auth
      // ──────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          description: 'Authenticates a user and starts a session.',
          operationId: 'login',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'User authenticated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          email: { type: 'string', format: 'email' },
                          name: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        }
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout',
          description: 'Clears the user session.',
          operationId: 'logout',
          responses: {
            200: {
              description: 'Session cleared',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Success' }
                }
              }
            }
          }
        }
      },

      // ──────────────────────────────────────
      // API Tokens
      // ──────────────────────────────────────
      '/api/user/tokens': {
        get: {
          tags: ['Auth'],
          summary: 'List API tokens',
          description: 'Returns all API tokens for the authenticated user. Raw token values are not included.',
          operationId: 'listApiTokens',
          responses: {
            200: {
              description: 'Array of tokens',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ApiToken' }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        },
        post: {
          tags: ['Auth'],
          summary: 'Create API token',
          description: 'Creates a new API token. The raw token is returned only once in the response. Use as `Authorization: Bearer <token>`.',
          operationId: 'createApiToken',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    expiresInDays: { type: 'integer', description: 'Days until expiration. Omit for non-expiring token.' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Created token with raw value (one-time)',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/ApiToken' },
                      {
                        type: 'object',
                        properties: {
                          token: { type: 'string', description: 'Raw token value (only returned on creation)' }
                        }
                      }
                    ]
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        }
      },
      '/api/user/tokens/{id}': {
        delete: {
          tags: ['Auth'],
          summary: 'Delete API token',
          operationId: 'deleteApiToken',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            200: {
              description: 'Token deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },

      // ──────────────────────────────────────
      // Projects
      // ──────────────────────────────────────
      '/api/projects': {
        get: {
          tags: ['Projects'],
          summary: 'List projects',
          description: 'Returns projects the current user is a member of. Admins see all projects.',
          operationId: 'listProjects',
          responses: {
            200: {
              description: 'Array of projects',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      allOf: [
                        { $ref: '#/components/schemas/Project' },
                        {
                          type: 'object',
                          properties: {
                            role: { type: 'string', enum: ['owner', 'member', 'admin'] },
                            boardCount: { type: 'integer' },
                            totalCards: { type: 'integer' },
                            openCards: { type: 'integer' },
                            memberCount: { type: 'integer' },
                            memberAvatars: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  name: { type: 'string' },
                                  avatarUrl: { type: 'string', nullable: true }
                                }
                              }
                            },
                            lastActivity: { type: 'string', format: 'date-time', nullable: true }
                          }
                        }
                      ]
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        },
        post: {
          tags: ['Projects'],
          summary: 'Create project',
          description: 'Creates a new project with default statuses, tags, and a board. The creator becomes the owner.',
          operationId: 'createProject',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    key: { type: 'string', pattern: '^[A-Z]{2,5}$', description: 'Auto-generated from name if omitted' },
                    slug: { type: 'string', description: 'Auto-generated from name if omitted' },
                    description: { type: 'string' },
                    briefing: { type: 'string', description: 'Markdown project context sent to AI features' },
                    icon: { type: 'string', description: 'Lucide icon name' },
                    doneStatusName: { type: 'string', description: 'Name of the default status to mark as done. Defaults to "Done".' },
                    doneRetentionDays: { type: 'integer', nullable: true, description: 'Days to keep done cards visible. null = unlimited. Default: 30.' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Created project',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            409: { $ref: '#/components/responses/Conflict' }
          }
        }
      },
      '/api/projects/{id}': {
        get: {
          tags: ['Projects'],
          summary: 'Get project',
          description: 'Returns project details by ID or slug, including boards, statuses, tags, card counts, and priority breakdown.',
          operationId: 'getProject',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            200: {
              description: 'Project details',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Project' },
                      {
                        type: 'object',
                        properties: {
                          role: { type: 'string', enum: ['owner', 'member', 'admin'] },
                          boards: {
                            type: 'array',
                            items: {
                              allOf: [
                                { $ref: '#/components/schemas/Board' },
                                {
                                  type: 'object',
                                  properties: {
                                    cardCount: { type: 'integer' },
                                    lastActivity: { type: 'string', format: 'date-time', nullable: true },
                                    createdBy: { $ref: '#/components/schemas/UserSummary' }
                                  }
                                }
                              ]
                            }
                          },
                          lists: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' },
                                slug: { type: 'string' }
                              }
                            }
                          },
                          statuses: {
                            type: 'array',
                            items: {
                              allOf: [
                                { $ref: '#/components/schemas/Status' },
                                {
                                  type: 'object',
                                  properties: { cardCount: { type: 'integer' } }
                                }
                              ]
                            }
                          },
                          tags: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Tag' }
                          },
                          totalCards: { type: 'integer' },
                          openCards: { type: 'integer' },
                          priorityCounts: {
                            type: 'object',
                            properties: {
                              urgent: { type: 'integer' },
                              high: { type: 'integer' },
                              medium: { type: 'integer' },
                              low: { type: 'integer' }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        put: {
          tags: ['Projects'],
          summary: 'Update project',
          description: 'Updates project details. Owner or admin only.',
          operationId: 'updateProject',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    briefing: { type: 'string', nullable: true },
                    icon: { type: 'string' },
                    slug: { type: 'string' },
                    key: { type: 'string', pattern: '^[A-Z]{2,5}$' },
                    doneStatusId: { type: 'string', nullable: true, description: 'Status ID to mark as done, or null for none' },
                    doneRetentionDays: { type: 'integer', nullable: true, description: 'Days to keep done cards visible, or null for unlimited' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated project',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
            409: { $ref: '#/components/responses/Conflict' }
          }
        },
        delete: {
          tags: ['Projects'],
          summary: 'Delete project',
          description: 'Deletes a project and all associated data. Owner or admin only.',
          operationId: 'deleteProject',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            200: {
              description: 'Deletion confirmed',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },

      // ──────────────────────────────────────
      // Members
      // ──────────────────────────────────────
      '/api/projects/{id}/members': {
        get: {
          tags: ['Members'],
          summary: 'List project members',
          operationId: 'listMembers',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            200: {
              description: 'Array of members',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      allOf: [
                        { $ref: '#/components/schemas/Member' },
                        {
                          type: 'object',
                          properties: { user: { $ref: '#/components/schemas/UserSummary' } }
                        }
                      ]
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        },
        post: {
          tags: ['Members'],
          summary: 'Add member or invite by email',
          description: 'Adds an existing user directly, or creates a pending invitation if the email is not registered. Owner or admin only.',
          operationId: 'addMemberOrInvite',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string', format: 'uuid', description: 'User ID to add (preferred)' },
                    email: { type: 'string', format: 'email', description: 'User email to add or invite' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Existing user added directly',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Member' },
                      { type: 'object', properties: { invited: { type: 'boolean', example: false } } }
                    ]
                  }
                }
              }
            },
            201: {
              description: 'Invitation created for non-registered user',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      invited: { type: 'boolean', example: true },
                      email: { type: 'string', format: 'email' }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            409: { $ref: '#/components/responses/Conflict' }
          }
        }
      },
      '/api/projects/{projectId}/members/{userId}': {
        patch: {
          tags: ['Members'],
          summary: 'Change member role',
          description: 'Changes a member\'s role between owner and member. Cannot demote the last owner.',
          operationId: 'changeMemberRole',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['role'],
                  properties: {
                    role: { type: 'string', enum: ['owner', 'member'] }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Role updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      role: { type: 'string', enum: ['owner', 'member'] }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Members'],
          summary: 'Remove project member',
          operationId: 'removeMember',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            200: {
              description: 'Member removed',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/projects/{id}/invitations': {
        get: {
          tags: ['Members'],
          summary: 'List pending invitations',
          description: 'Returns non-expired pending invitations for the project. Owner or admin only.',
          operationId: 'listInvitations',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            200: {
              description: 'Array of pending invitations',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        role: { type: 'string', enum: ['owner', 'member'] },
                        createdAt: { type: 'string', format: 'date-time' },
                        invitedBy: {
                          type: 'object',
                          properties: { name: { type: 'string' } }
                        }
                      }
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/projects/{projectId}/invitations/{invitationId}': {
        delete: {
          tags: ['Members'],
          summary: 'Cancel invitation',
          operationId: 'cancelInvitation',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'invitationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            200: {
              description: 'Invitation cancelled',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/projects/{projectId}/invitations/{invitationId}/resend': {
        post: {
          tags: ['Members'],
          summary: 'Resend project invitation',
          description: 'Resends an invitation email with a fresh token and reset expiry.',
          operationId: 'resendProjectInvitation',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'invitationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            200: {
              description: 'Invitation resent',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },

      // ──────────────────────────────────────
      // Statuses
      // ──────────────────────────────────────
      '/api/projects/{id}/statuses': {
        post: {
          tags: ['Statuses'],
          summary: 'Create project status',
          description: 'Creates a project-level status (not linked to any board). Owner or admin only.',
          operationId: 'createProjectStatus',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'string', description: 'Hex color code (e.g. "#3b82f6")' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Created status',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Status' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/statuses/{id}': {
        put: {
          tags: ['Statuses'],
          summary: 'Update status',
          operationId: 'updateStatus',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated status',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Status' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Statuses'],
          summary: 'Delete status',
          description: 'Permanently deletes a project-level status. Cascades to board links and cards.',
          operationId: 'deleteStatus',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Status deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },

      // ──────────────────────────────────────
      // Boards
      // ──────────────────────────────────────
      '/api/projects/{id}/boards': {
        post: {
          tags: ['Boards'],
          summary: 'Create board',
          description: 'Creates a new board and links all existing project statuses.',
          operationId: 'createBoard',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string', description: 'Auto-generated from name if omitted' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Created board',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Board' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            409: { $ref: '#/components/responses/Conflict' }
          }
        }
      },
      '/api/boards/{id}': {
        get: {
          tags: ['Boards'],
          summary: 'Get board',
          description: 'Returns board with columns (statuses), cards, members, project info, tags, and available (unlinked) statuses. Done retention filtering is applied.',
          operationId: 'getBoard',
          parameters: [
            { $ref: '#/components/parameters/BoardId' },
            { name: 'projectSlug', in: 'query', schema: { type: 'string' }, description: 'Scope board slug lookup to project' }
          ],
          responses: {
            200: {
              description: 'Board details',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Board' },
                      {
                        type: 'object',
                        properties: {
                          createdBy: { $ref: '#/components/schemas/UserSummary' },
                          role: { type: 'string', enum: ['owner', 'member', 'admin'] },
                          columns: {
                            type: 'array',
                            items: {
                              allOf: [
                                { $ref: '#/components/schemas/Status' },
                                { type: 'object', properties: { position: { type: 'integer' } } }
                              ]
                            }
                          },
                          cards: {
                            type: 'array',
                            items: {
                              allOf: [
                                { $ref: '#/components/schemas/Card' },
                                {
                                  type: 'object',
                                  properties: {
                                    assignee: { $ref: '#/components/schemas/UserSummary' }
                                  }
                                }
                              ]
                            }
                          },
                          members: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/UserSummary' }
                          },
                          project: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              slug: { type: 'string' },
                              key: { type: 'string' },
                              doneStatusId: { type: 'string', format: 'uuid', nullable: true },
                              doneRetentionDays: { type: 'integer', nullable: true }
                            }
                          },
                          tags: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Tag' }
                          },
                          availableColumns: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Status' },
                            description: 'Project statuses not currently linked to this board'
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        put: {
          tags: ['Boards'],
          summary: 'Update board',
          operationId: 'updateBoard',
          parameters: [{ $ref: '#/components/parameters/BoardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated board',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Board' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
            409: { $ref: '#/components/responses/Conflict' }
          }
        },
        delete: {
          tags: ['Boards'],
          summary: 'Delete board',
          description: 'Deletes the board and its status links. Project-level statuses and cards are preserved.',
          operationId: 'deleteBoard',
          parameters: [{ $ref: '#/components/parameters/BoardId' }],
          responses: {
            200: {
              description: 'Board deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/boards/{id}/columns': {
        post: {
          tags: ['Statuses'],
          summary: 'Create status on board',
          description: 'Creates a project-level status and links it to this board.',
          operationId: 'createBoardStatus',
          parameters: [{ $ref: '#/components/parameters/BoardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'string', description: 'Hex color code' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Created status',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Status' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/boards/{boardId}/columns/{columnId}': {
        delete: {
          tags: ['Statuses'],
          summary: 'Unlink status from board',
          description: 'Removes the status from this board. The project-level status and its cards are preserved.',
          operationId: 'unlinkBoardStatus',
          parameters: [
            { name: 'boardId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'columnId', in: 'path', required: true, schema: { type: 'string' }, description: 'Status ID to unlink' }
          ],
          responses: {
            200: {
              description: 'Status unlinked',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/boards/{id}/columns/link': {
        post: {
          tags: ['Statuses'],
          summary: 'Link existing status to board',
          operationId: 'linkStatusToBoard',
          parameters: [{ $ref: '#/components/parameters/BoardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['statusId'],
                  properties: {
                    statusId: { type: 'string', format: 'uuid' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Status linked',
              content: { 'application/json': { schema: { type: 'object' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            409: { $ref: '#/components/responses/Conflict' }
          }
        }
      },
      '/api/boards/{id}/columns/reorder': {
        put: {
          tags: ['Statuses'],
          summary: 'Reorder board columns',
          operationId: 'reorderBoardStatuses',
          parameters: [{ $ref: '#/components/parameters/BoardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['columns'],
                  properties: {
                    columns: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['id', 'position'],
                        properties: {
                          id: { type: 'string', description: 'Status ID' },
                          position: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Columns reordered',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },

      // ──────────────────────────────────────
      // Lists
      // ──────────────────────────────────────
      '/api/projects/{id}/lists': {
        post: {
          tags: ['Lists'],
          summary: 'Create list',
          operationId: 'createList',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string' },
                    columns: { type: 'array', items: { type: 'string' }, description: 'Field names. Defaults to ticketId, title, status, priority, assignee, tags.' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Created list' },
            400: { $ref: '#/components/responses/BadRequest' }
          }
        }
      },
      '/api/lists/{id}': {
        get: {
          tags: ['Lists'],
          summary: 'Get list',
          description: 'Returns list with columns, cards, members, statuses, and tags.',
          operationId: 'getList',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'List ID or slug' },
            { name: 'projectSlug', in: 'query', schema: { type: 'string' }, description: 'Scope slug lookup to project' }
          ],
          responses: {
            200: { description: 'List with columns, cards, members, statuses, tags' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        put: {
          tags: ['Lists'],
          summary: 'Update list',
          operationId: 'updateList',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Updated list' },
            400: { $ref: '#/components/responses/BadRequest' },
            409: { $ref: '#/components/responses/Conflict' }
          }
        },
        delete: {
          tags: ['Lists'],
          summary: 'Delete list',
          operationId: 'deleteList',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'List deleted' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },

      // ──────────────────────────────────────
      // Cards
      // ──────────────────────────────────────
      '/api/boards/{id}/cards': {
        post: {
          tags: ['Cards'],
          summary: 'Create card (via board)',
          description: 'Creates a new card in the specified status. The status must belong to the board\'s project.',
          operationId: 'createCard',
          parameters: [{ $ref: '#/components/parameters/BoardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardInput' }
              }
            }
          },
          responses: {
            201: {
              description: 'Created card',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Card' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/lists/{id}/cards': {
        post: {
          tags: ['Cards'],
          summary: 'Create card (via list)',
          operationId: 'createListCard',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardInput' }
              }
            }
          },
          responses: {
            201: {
              description: 'Created card',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Card' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/cards/{id}': {
        get: {
          tags: ['Cards'],
          summary: 'Get card',
          description: 'Returns card details by numeric ID or ticket slug (e.g. "TK-42"). Includes assignee, project, statuses, members, and tags.',
          operationId: 'getCard',
          parameters: [{ $ref: '#/components/parameters/CardId' }],
          responses: {
            200: {
              description: 'Card details',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Card' },
                      {
                        type: 'object',
                        properties: {
                          assignee: { $ref: '#/components/schemas/UserSummary' },
                          project: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              slug: { type: 'string' },
                              key: { type: 'string' }
                            }
                          },
                          statuses: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Status' }
                          },
                          members: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/UserSummary' }
                          },
                          tags: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Tag' }
                          },
                          projectTags: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Tag' }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        put: {
          tags: ['Cards'],
          summary: 'Update card',
          operationId: 'updateCard',
          parameters: [{ $ref: '#/components/parameters/CardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                    assigneeId: { type: 'string', format: 'uuid', nullable: true },
                    statusId: { type: 'string', format: 'uuid' },
                    dueDate: { type: 'string', format: 'date', nullable: true, description: 'YYYY-MM-DD, null to clear' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated card',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Card' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Cards'],
          summary: 'Delete card',
          operationId: 'deleteCard',
          parameters: [{ $ref: '#/components/parameters/CardId' }],
          responses: {
            200: {
              description: 'Card deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/cards/{id}/move': {
        put: {
          tags: ['Cards'],
          summary: 'Move card',
          description: 'Moves a card to a new status and/or position. Position renumbering is transactional.',
          operationId: 'moveCard',
          parameters: [{ $ref: '#/components/parameters/CardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['statusId', 'position'],
                  properties: {
                    statusId: { type: 'string', format: 'uuid' },
                    position: { type: 'integer' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Card moved',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/boards/{id}/cards/reorder': {
        put: {
          tags: ['Cards'],
          summary: 'Batch reorder cards on board',
          operationId: 'reorderBoardCards',
          parameters: [{ $ref: '#/components/parameters/BoardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['moves'],
                  properties: {
                    moves: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['cardId', 'statusId', 'position'],
                        properties: {
                          cardId: { type: 'integer' },
                          statusId: { type: 'string', format: 'uuid' },
                          position: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Cards reordered',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/projects/{id}/cards/search': {
        get: {
          tags: ['Cards'],
          summary: 'Search cards in project',
          description: 'Searches by title (LIKE) and card ID. Supports ticket slugs (e.g. "TK-42"). Min 2 characters.',
          operationId: 'searchProjectCards',
          parameters: [
            { $ref: '#/components/parameters/ProjectId' },
            { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 } }
          ],
          responses: {
            200: {
              description: 'Matching cards',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        title: { type: 'string' },
                        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }
                      }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },

      // ──────────────────────────────────────
      // Tags
      // ──────────────────────────────────────
      '/api/projects/{id}/tags': {
        get: {
          tags: ['Tags'],
          summary: 'List project tags',
          operationId: 'listProjectTags',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            200: {
              description: 'Array of tags',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Tag' } }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        },
        post: {
          tags: ['Tags'],
          summary: 'Create tag',
          operationId: 'createTag',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'string', description: 'Hex color code' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Created tag',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Tag' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/tags/{id}': {
        put: {
          tags: ['Tags'],
          summary: 'Update tag',
          operationId: 'updateTag',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated tag',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Tag' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Tags'],
          summary: 'Delete tag',
          description: 'Cascades to card-tag associations.',
          operationId: 'deleteTag',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: {
              description: 'Tag deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/cards/{id}/tags': {
        put: {
          tags: ['Tags', 'Cards'],
          summary: 'Set card tags',
          description: 'Full replacement of tags on a card. All tag IDs must belong to the card\'s project.',
          operationId: 'setCardTags',
          parameters: [{ $ref: '#/components/parameters/CardId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['tagIds'],
                  properties: {
                    tagIds: {
                      type: 'array',
                      items: { type: 'string', format: 'uuid' }
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated card tags',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },

      // ──────────────────────────────────────
      // Attachments
      // ──────────────────────────────────────
      '/api/cards/{id}/attachments': {
        get: {
          tags: ['Attachments'],
          summary: 'List card attachments',
          operationId: 'listAttachments',
          parameters: [{ $ref: '#/components/parameters/CardId' }],
          responses: {
            200: {
              description: 'Array of attachments',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Attachment' }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        post: {
          tags: ['Attachments'],
          summary: 'Upload attachment',
          description: 'Uploads a file to a card. Max size and allowed types are server-configured (UPLOAD_MAX_SIZE_MB, UPLOAD_ALLOWED_TYPES).',
          operationId: 'uploadAttachment',
          parameters: [{ $ref: '#/components/parameters/CardId' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Uploaded attachment',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Attachment' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
            413: { description: 'File too large' },
            415: { description: 'Unsupported file type' }
          }
        }
      },
      '/api/attachments/{id}/download': {
        get: {
          tags: ['Attachments'],
          summary: 'Download attachment',
          operationId: 'downloadAttachment',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: {
              description: 'File content',
              content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/attachments/{id}': {
        delete: {
          tags: ['Attachments'],
          summary: 'Delete attachment',
          operationId: 'deleteAttachment',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: {
              description: 'Attachment deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },

      // ──────────────────────────────────────
      // User
      // ──────────────────────────────────────
      '/api/user/profile': {
        get: {
          tags: ['User'],
          summary: 'Get current user profile',
          operationId: 'getUserProfile',
          responses: {
            200: {
              description: 'Profile with stats',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      createdAt: { type: 'string', format: 'date-time', nullable: true },
                      lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
                      priorityCounts: {
                        type: 'object',
                        properties: {
                          urgent: { type: 'integer' },
                          high: { type: 'integer' },
                          medium: { type: 'integer' },
                          low: { type: 'integer' }
                        }
                      },
                      totalOpen: { type: 'integer' },
                      projects: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            name: { type: 'string' },
                            slug: { type: 'string' },
                            key: { type: 'string' },
                            icon: { type: 'string', nullable: true },
                            role: { type: 'string' },
                            openCards: { type: 'integer' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        },
        put: {
          tags: ['User'],
          summary: 'Update profile',
          operationId: 'updateUserProfile',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    avatarUrl: { type: 'string', nullable: true },
                    colorMode: { type: 'string', enum: ['light', 'dark'], nullable: true }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated profile',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      email: { type: 'string', format: 'email' },
                      name: { type: 'string' },
                      avatarUrl: { type: 'string', nullable: true },
                      colorMode: { type: 'string', enum: ['light', 'dark'], nullable: true }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        }
      },
      '/api/user/password': {
        put: {
          tags: ['User'],
          summary: 'Change password',
          operationId: 'changePassword',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['currentPassword', 'newPassword'],
                  properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8 }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Password changed',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        }
      },
      '/api/user/account': {
        delete: {
          tags: ['User'],
          summary: 'Delete own account',
          description: 'Permanently deletes the authenticated user\'s account. Requires password confirmation. Admin accounts cannot self-delete.',
          operationId: 'deleteOwnAccount',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['password'],
                  properties: {
                    password: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Account deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },

      // ──────────────────────────────────────
      // My Tasks
      // ──────────────────────────────────────
      '/api/my-tasks': {
        get: {
          tags: ['My Tasks'],
          summary: 'Get my tasks',
          description: 'Returns cards assigned to the current user grouped by project. Not admin-elevated.',
          operationId: 'getMyTasks',
          responses: {
            200: {
              description: 'Tasks grouped by project',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      columns: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            field: { type: 'string' },
                            position: { type: 'integer' }
                          }
                        }
                      },
                      groups: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            project: { $ref: '#/components/schemas/Project' },
                            statuses: { type: 'array', items: { $ref: '#/components/schemas/Status' } },
                            cards: {
                              type: 'array',
                              items: {
                                allOf: [
                                  { $ref: '#/components/schemas/Card' },
                                  {
                                    type: 'object',
                                    properties: {
                                      assignee: { $ref: '#/components/schemas/UserSummary' },
                                      status: {
                                        type: 'object',
                                        nullable: true,
                                        properties: {
                                          id: { type: 'string', format: 'uuid' },
                                          name: { type: 'string' },
                                          color: { type: 'string', nullable: true }
                                        }
                                      },
                                      tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } }
                                    }
                                  }
                                ]
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        }
      },

      // ──────────────────────────────────────
      // Admin
      // ──────────────────────────────────────
      '/api/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'List all users',
          description: 'Admin only.',
          operationId: 'listAllUsers',
          responses: {
            200: {
              description: 'Array of users',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      allOf: [
                        { $ref: '#/components/schemas/User' },
                        {
                          type: 'object',
                          properties: {
                            suspendedAt: { type: 'string', format: 'date-time', nullable: true },
                            lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
                            pendingSetup: { type: 'boolean' }
                          }
                        }
                      ]
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        },
        post: {
          tags: ['Admin'],
          summary: 'Create user',
          description: 'Creates a user with unusable password and sends setup email. Bypasses domain allowlist.',
          operationId: 'createUser',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'User created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      email: { type: 'string', format: 'email' },
                      name: { type: 'string' }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/admin/users/{id}': {
        patch: {
          tags: ['Admin'],
          summary: 'Update user (suspend, admin)',
          description: 'Suspend/unsuspend or promote/demote admin. Cannot self-modify.',
          operationId: 'updateUser',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    suspended: { type: 'boolean' },
                    isAdmin: { type: 'boolean' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'User updated',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Admin'],
          summary: 'Delete user',
          description: 'Permanently deletes a user account. Admin only.',
          operationId: 'deleteUser',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: {
              description: 'User deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/admin/users/{id}/resend-setup': {
        post: {
          tags: ['Admin'],
          summary: 'Resend setup email',
          description: 'Resends account setup email for an admin-created user pending setup.',
          operationId: 'resendSetupEmail',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: {
              description: 'Email resent',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/admin/invitations': {
        get: {
          tags: ['Admin'],
          summary: 'List all pending invitations',
          description: 'Returns non-expired project invitations for non-registered users.',
          operationId: 'listPendingInvitations',
          responses: {
            200: {
              description: 'Array of pending invitations',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        projectId: { type: 'string', format: 'uuid' },
                        projectName: { type: 'string' },
                        inviterName: { type: 'string' },
                        expiresAt: { type: 'string', format: 'date-time' },
                        createdAt: { type: 'string', format: 'date-time' }
                      }
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/admin/settings': {
        get: {
          tags: ['Admin'],
          summary: 'Get global settings',
          operationId: 'getGlobalSettings',
          responses: {
            200: {
              description: 'Settings',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      allowedEmailDomains: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Allowed email domains for registration. Empty = unrestricted.'
                      }
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        },
        put: {
          tags: ['Admin'],
          summary: 'Update global settings',
          operationId: 'updateGlobalSettings',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    allowedEmailDomains: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated settings',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      allowedEmailDomains: { type: 'array', items: { type: 'string' } }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },

      // ──────────────────────────────────────
      // AI Skills
      // ──────────────────────────────────────
      '/api/skills': {
        get: {
          tags: ['AI'],
          summary: 'List AI skills',
          description: 'Returns skills available to the current user (without prompt content).',
          operationId: 'listSkills',
          parameters: [
            { name: 'scope', in: 'query', schema: { type: 'string', enum: ['card', 'board'] } }
          ],
          responses: {
            200: {
              description: 'Array of skills',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        scope: { type: 'string', enum: ['card', 'board'] },
                        position: { type: 'integer' }
                      }
                    }
                  }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' }
          }
        }
      },
      '/api/admin/skills': {
        get: {
          tags: ['Admin', 'AI'],
          summary: 'List all skills (admin)',
          description: 'Returns all AI skills with full details including prompts.',
          operationId: 'listAdminSkills',
          responses: {
            200: {
              description: 'Array of skills',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/AiSkill' } }
                }
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        },
        post: {
          tags: ['Admin', 'AI'],
          summary: 'Create skill',
          operationId: 'createSkill',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'prompt'],
                  properties: {
                    name: { type: 'string' },
                    prompt: { type: 'string', description: 'Template with {title}, {description}, {tags}, {priority} variables' },
                    scope: { type: 'string', enum: ['card', 'board'], default: 'card' }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: 'Created skill',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AiSkill' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },
      '/api/admin/skills/{id}': {
        put: {
          tags: ['Admin', 'AI'],
          summary: 'Update skill',
          operationId: 'updateSkill',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    prompt: { type: 'string' },
                    scope: { type: 'string', enum: ['card', 'board'] }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated skill',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AiSkill' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Admin', 'AI'],
          summary: 'Delete skill',
          operationId: 'deleteSkill',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: {
              description: 'Skill deleted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/api/admin/skills/reorder': {
        put: {
          tags: ['Admin', 'AI'],
          summary: 'Reorder skills',
          operationId: 'reorderSkills',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['skills'],
                  properties: {
                    skills: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['id', 'position'],
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          position: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Skills reordered',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' }
          }
        }
      },

      // ──────────────────────────────────────
      // AI Generation
      // ──────────────────────────────────────
      '/api/projects/{projectId}/ai/generate-description': {
        post: {
          tags: ['AI'],
          summary: 'Generate card description',
          description: 'Generates or improves a card description using AI. Streams response via SSE. Project briefing is automatically included as context.',
          operationId: 'generateDescription',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string', description: 'Current description (for improve mode)' },
                    tags: { type: 'array', items: { type: 'string' } },
                    priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                    skillId: { type: 'string', format: 'uuid', description: 'AI skill to use' },
                    userPrompt: { type: 'string', description: 'Free-text prompt' },
                    mode: { type: 'string', enum: ['generate', 'improve'], description: 'Legacy mode (ignored if skillId or userPrompt provided)' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'SSE stream of generated text',
              content: { 'text/event-stream': { schema: { type: 'string' } } }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      }
    },

    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'nuxt-session'
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API token (create via POST /api/user/tokens)'
        }
      },

      parameters: {
        ProjectId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Project ID (UUID) or slug'
        },
        BoardId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Board ID (UUID) or slug'
        },
        CardId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Card ID (integer) or ticket slug (e.g. "TK-42")'
        }
      },

      schemas: {
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            key: { type: 'string', description: '2-5 uppercase letter project key' },
            description: { type: 'string', nullable: true },
            briefing: { type: 'string', nullable: true },
            icon: { type: 'string', nullable: true, description: 'Lucide icon name' },
            doneStatusId: { type: 'string', format: 'uuid', nullable: true },
            doneRetentionDays: { type: 'integer', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Board: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            position: { type: 'integer' },
            createdById: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Status: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            color: { type: 'string', nullable: true, description: 'Hex color code' }
          }
        },
        Card: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Auto-incrementing integer ID' },
            statusId: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            assigneeId: { type: 'string', format: 'uuid', nullable: true },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            dueDate: { type: 'string', format: 'date-time', nullable: true, description: 'Due date (date only, stored as timestamp)' },
            position: { type: 'integer' },
            createdById: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            tags: {
              type: 'array',
              items: { $ref: '#/components/schemas/Tag' }
            }
          }
        },
        CardInput: {
          type: 'object',
          required: ['statusId', 'title'],
          properties: {
            statusId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            assigneeId: { type: 'string', format: 'uuid', nullable: true },
            dueDate: { type: 'string', format: 'date', nullable: true, description: 'YYYY-MM-DD' }
          }
        },
        Tag: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            color: { type: 'string' }
          }
        },
        Attachment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            cardId: { type: 'integer' },
            projectId: { type: 'string', format: 'uuid' },
            originalName: { type: 'string' },
            mimeType: { type: 'string' },
            size: { type: 'integer', description: 'File size in bytes' },
            uploadedById: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            avatarUrl: { type: 'string', nullable: true },
            colorMode: { type: 'string', enum: ['light', 'dark'], nullable: true },
            isAdmin: { type: 'integer', enum: [0, 1] },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        UserSummary: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            avatarUrl: { type: 'string', nullable: true }
          }
        },
        Member: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['owner', 'member'] }
          }
        },
        AiSkill: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            prompt: { type: 'string', description: 'Prompt template with {title}, {description}, {tags}, {priority} variables' },
            scope: { type: 'string', enum: ['card', 'board'] },
            position: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        ApiToken: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            tokenPrefix: { type: 'string', description: 'First characters for identification' },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            isExpired: { type: 'boolean' }
          }
        },
        Error: {
          type: 'object',
          required: ['statusCode', 'message'],
          properties: {
            statusCode: { type: 'integer' },
            message: { type: 'string' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', enum: [true] }
          }
        }
      },

      responses: {
        BadRequest: {
          description: 'Bad request — invalid or missing parameters',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        Unauthorized: {
          description: 'Unauthorized — authentication required',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        Forbidden: {
          description: 'Forbidden — insufficient permissions',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        NotFound: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        Conflict: {
          description: 'Conflict — resource already exists',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        }
      }
    }
  }
})
