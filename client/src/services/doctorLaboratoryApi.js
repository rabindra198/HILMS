import api from "@/lib/axios";

const request = (method, url, data) =>
  api({ method, url: `/doctor/laboratory${url}`, data }).then(
    (response) => response.data?.data ?? response.data,
  );

export const doctorLaboratoryApi = {
  getWorkspace: () => request("get", ""),
  createRequest: (data) => request("post", "/requests", data),
};
