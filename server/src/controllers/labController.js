import mongoose from "mongoose";
import LabRequest from "../models/LabRequest.js";
import LabReport from "../models/LabReport.js";
import { LAB_TESTS } from "../models/LabRequest.js";

const idOf = (value) => {
  if (!value) return undefined;
  return typeof value.toString === "function" ? value.toString() : value;
};

const patientResource = (p) => {
  if (!p) return null;
  return {
    id: idOf(p._id || p.id),
    patientId: p.patientId,
    name: p.name,
    age: p.age,
    gender: p.gender,
    bloodGroup: p.bloodGroup,
    phone: p.phone,
    email: p.email,
    address: p.address,
    allergies: p.allergies || [],
    conditions: p.conditions || [],
  };
};

export const getLabRequests = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const requests = await LabRequest.find(filter)
      .populate("patient")
      .populate("doctor")
      .sort({ createdAt: -1 });

    res.status(200).json({
      requests: requests.map((r) => ({
        id: idOf(r._id),
        patient: r.patient ? patientResource(r.patient) : null,
        doctor: r.doctor,
        testName: r.testName,
        clinicalNotes: r.clinicalNotes,
        priority: r.priority,
        requestedDate: r.requestedDate,
        status: r.status,
        createdAt: r.createdAt || null,
      })),
      tests: LAB_TESTS,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLabRequestStatus = async (req, res, next) => {
  try {
    const request = await LabRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Lab request not found" });
    }

    const validStatuses = ["Pending", "In Progress", "Completed", "Cancelled"];
    const newStatus = req.body.status;
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    request.status = newStatus;
    await request.save();

    res.status(200).json({
      message: "Lab request status updated",
      request: {
        id: idOf(request._id),
        status: request.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createLabReport = async (req, res, next) => {
  try {
    const request = await LabRequest.findById(req.body.requestId);
    if (!request) {
      return res.status(404).json({ message: "Lab request not found" });
    }

    if (request.status === "Completed") {
      return res.status(400).json({ message: "Lab request already has a report" });
    }

    const report = await LabReport.create({
      request: request._id,
      doctor: request.doctor,
      patient: request.patient,
      testName: request.testName,
      requestedDate: request.requestedDate,
      completedDate: new Date().toISOString().slice(0, 10),
      results: req.body.results || [],
      status: "Completed",
      comment: req.body.comment || "",
      reviewed: false,
      treatment: {},
    });

    request.status = "Completed";
    await request.save();

    res.status(201).json({
      message: "Lab report created successfully",
      report: {
        id: idOf(report._id),
        requestId: idOf(request._id),
        testName: report.testName,
        requestedDate: report.requestedDate,
        completedDate: report.completedDate,
        results: report.results,
        status: report.status,
        comment: report.comment,
        reviewed: report.reviewed,
        createdAt: report.createdAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLabReports = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const reports = await LabReport.find(filter)
      .populate("patient")
      .populate("doctor")
      .sort({ createdAt: -1 });

    res.status(200).json({
      reports: reports.map((r) => ({
        id: idOf(r._id),
        patient: r.patient ? patientResource(r.patient) : null,
        doctor: r.doctor,
        testName: r.testName,
        requestedDate: r.requestedDate,
        completedDate: r.completedDate,
        results: r.results || [],
        status: r.status,
        comment: r.comment,
        reviewed: r.reviewed,
        createdAt: r.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getLabReportDetail = async (req, res, next) => {
  try {
    const report = await LabReport.findById(req.params.id)
      .populate("patient")
      .populate("doctor");
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    const previousReports = await LabReport.find({
      patient: report.patient._id,
      testName: report.testName,
      _id: { $ne: report._id },
    })
      .populate("patient")
      .sort({ createdAt: -1 });

    res.status(200).json({
      report: {
        id: idOf(report._id),
        patient: report.patient ? patientResource(report.patient) : null,
        doctor: report.doctor,
        testName: report.testName,
        requestedDate: report.requestedDate,
        completedDate: report.completedDate,
        results: report.results || [],
        status: report.status,
        comment: report.comment,
        reviewed: report.reviewed,
        treatment: report.treatment || {},
        createdAt: report.createdAt || null,
      },
      previousReports: previousReports.map((r) => ({
        id: idOf(r._id),
        testName: r.testName,
        completedDate: r.completedDate,
        results: r.results || [],
        createdAt: r.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};
