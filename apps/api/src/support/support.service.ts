import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const OPEN_STATUSES = ['open', 'in_progress', 'waiting'];

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  listForBusiness(businessId: string) {
    return this.prisma.supportTicket.findMany({
      where: { businessId },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async getForBusiness(businessId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, businessId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    return ticket;
  }

  async create(user: { id: string; businessId: string }, dto: { subject: string; category?: string; body: string }) {
    return this.prisma.supportTicket.create({
      data: {
        businessId: user.businessId,
        userId: user.id,
        subject: dto.subject.trim(),
        category: dto.category || 'otro',
        messages: {
          create: { userId: user.id, fromStaff: false, body: dto.body.trim() },
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }

  async replyAsUser(user: { id: string; businessId: string }, ticketId: string, body: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, businessId: user.businessId } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    if (ticket.status === 'closed') throw new ForbiddenException('Este ticket ya está cerrado.');
    await this.prisma.supportMessage.create({
      data: { ticketId, userId: user.id, fromStaff: false, body: body.trim() },
    });
    const nextStatus = ticket.status === 'resolved' || ticket.status === 'waiting' ? 'open' : ticket.status;
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: nextStatus, closedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }

  listAll(status?: string) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async getAny(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: { select: { id: true, name: true, planId: true, planStatus: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    return ticket;
  }

  async replyAsStaff(staff: { id: string }, ticketId: string, body: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    await this.prisma.supportMessage.create({
      data: { ticketId, userId: staff.id, fromStaff: true, body: body.trim() },
    });
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: ticket.status === 'closed' ? 'open' : 'waiting' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }

  async updateStatus(id: string, data: { status?: string; priority?: string }) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    const status = data.status ?? ticket.status;
    const closed = status === 'closed' || status === 'resolved';
    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        priority: data.priority ?? ticket.priority,
        closedAt: closed ? ticket.closedAt || new Date() : null,
      },
    });
  }

  openCount() {
    return this.prisma.supportTicket.count({ where: { status: { in: OPEN_STATUSES } } });
  }
}
